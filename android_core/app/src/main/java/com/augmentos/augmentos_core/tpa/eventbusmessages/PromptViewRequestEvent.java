package com.augmentos.augmentos_core.app.eventbusmessages;

public class PromptViewRequestEvent {
    public String prompt;
    public String [] options;
    public static final String eventId = "promptViewRequest";

    //if options is null, then it's a natural langauge prompt
    public PromptViewRequestEvent(String prompt, String [] options) {
        this.prompt = prompt;
        this.options = options;
    }
}
