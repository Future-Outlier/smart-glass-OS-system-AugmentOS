from DatabaseHandler import DatabaseHandler
import time
import traceback
from agents.wake_words import *
from agents.explicit_agent import run_explicit_agent_async
import asyncio
from helpers.time_function_decorator import time_function
from constants import EXPLICIT_AGENT


db_handler = DatabaseHandler(parent_handler=False)

pause_query_time = 1.5
force_query_time = 8

@time_function()
def stringify_history(insight_history):
    history = ""
    for c in insight_history:
        history += "User: {}\nLLM:{}\n\n".format(c['query'], c['insight'])
    return history

def is_user_id_in_user_list(user_id, user_list):
    for user_obj in user_list:
        if user_obj['user_id'] == user_id:
            return True
    return False


@time_function()
def explicit_agent_processing_loop():
    #lock = threading.Lock()

    print("START EXPLICIT AGENT PROCESSING LOOP")
    while True:
        if not db_handler.ready:
            print("db_handler not ready")
            time.sleep(0.1)
            continue

        try:
            # Get current wake worded users
            users = db_handler.get_users_with_recent_wake_words()

            # Try to find new wake worded users 
            newTranscripts = db_handler.get_recent_transcripts_from_last_nseconds_for_all_users(n=2)
            for t in newTranscripts:
                if not db_handler.get_user_feature_enabled(t['user_id'], EXPLICIT_AGENT): continue
                if not is_user_id_in_user_list(t['user_id'], users):
                    db_handler.check_for_wake_words_in_transcript_text(t['user_id'], t['text'])

            for user in users:
                last_wake_word_time = user['last_wake_word_time']
                is_query_ready = False
                current_time = time.time()

                # If wake word is old, just run on what we have
                if current_time > last_wake_word_time + force_query_time:
                    is_query_ready = True

                # If there has been a pause (the latest transcript is old)
                latest_transcript = db_handler.get_latest_transcript_from_user_obj(user)
                if latest_transcript and (current_time > latest_transcript['timestamp'] + pause_query_time):
                    is_query_ready = True

                if not is_query_ready: continue
                
                db_handler.reset_wake_word_time_for_user(user['user_id'])

                # Because last_wake_word_time is set when the wake word is found, and NOT when the wake word actually occured,
                # we need to add a high number such as force_query_time to offset that inaccuracy
                num_seconds_to_get = round(current_time - last_wake_word_time) + force_query_time
                text, transcribe_language, device_id = db_handler.get_transcripts_from_last_nseconds_for_user_as_string(user_id=user['user_id'], n=num_seconds_to_get)

                # Pull query out of the text
                query = get_explicit_query_from_transcript(text)
                if query is None: 
                    print("THE QUERY IS NOTHING?!?! TEXT: " + text)
                    continue
                
                asyncio.run(call_explicit_agent(query, user, device_id))

        except Exception as e:
            print("Exception in EXPLITT QUERY STUFF..:")
            print(e)
            traceback.print_exc()
        time.sleep(0.1)


@time_function()
async def call_explicit_agent(query, user_obj, device_id):
    user = user_obj

    print("Run EXPLICIT QUERY STUFF with... user_id: '{}' ... text: '{}'".format(
        user['user_id'], query))
    
    query_uuid = db_handler.add_explicit_query_for_user(user['user_id'], query)
    print("##### locations:", db_handler.get_gps_location_results_for_user_device(user['user_id'], None))
    # Set up prompt for Meta Agent
    insight_history = db_handler.get_explicit_insights_history_for_user(user['user_id'], device_id=None, should_consume=False, include_consumed=True)
    stringified_insight_history = stringify_history(insight_history)

    # We get the few minutes, but truncate to avoid context issues (TODO: FIX WHEN PKMS SUPPORT IS READY)
    transcript_history = db_handler.get_transcripts_from_last_nseconds_for_user_as_string(user['user_id'], 8*60)
    # Remove query from history
    if query in transcript_history:
        transcript_history = transcript_history[0:transcript_history.find(query)]
    # If it's too long, cut off the beginning
    # 2000 chars ~= 500 tokens
    max_len = 2000
    if len(transcript_history) > max_len:
        transcript_history = transcript_history[(len(transcript_history)-max_len):]

    print("HISTORY GOING INTO QUERY: ")
    print(transcript_history) 

    insightGenerationStartTime = time.time()
    try:
        print(" RUN THE INSIGHT FOR EXPLICIT ")
        # CHAT HISTORY = CONTEXT IN FUNCTION
        print(user["user_id"])
        # print(user)
        insight = await run_explicit_agent_async(user["user_id"], query, transcript_history=transcript_history, insight_history=stringified_insight_history)
        
        print("========== 200 IQ INSIGHT ===========")
        print(insight)
        print("=====================================")
        
        #save this insight to the DB for the user
        db_handler.add_explicit_insight_result_for_user(user['user_id'], query, insight)
    except Exception as e:
        print("Exception in agent.run()...:")
        print(e)
        traceback.print_exc()

        # TODO: Use GPT to generate a random funny error message
        fallback_insight = "Hmm, not sure about that one, bud."

        db_handler.add_explicit_insight_result_for_user(user['user_id'], query, fallback_insight)
        db_handler.reset_wake_word_time_for_user(user['user_id'])

    db_handler.reset_wake_word_time_for_user(user['user_id'])

    insightGenerationEndTime = time.time()
    print("=== insightGeneration completed in {} seconds ===".format(
        round(insightGenerationEndTime - insightGenerationStartTime, 2)))
