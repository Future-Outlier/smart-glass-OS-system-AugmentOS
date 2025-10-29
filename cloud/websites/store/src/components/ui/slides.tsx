import { motion } from "framer-motion";

/**
 * Captions Slide - Returns a div with the captions image and custom-placed buttons
 */
export const CaptionsSlide: React.FC = () => {
  return (
    <div className="min-w-full flex items-center justify-center relative">
      <motion.img
        src="/slides/captions_slide.png"
        alt="Captions Slide"
        className="rounded-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Custom positioned buttons for this slide */}
      <motion.button
        className="absolute font-bold w-[250px] h-[45px] bottom-[40px] left-[60px] bg-[#FBFF00] hover:bg-[#ffd500] text-black px-8  shadow-lg rounded-full cursor-pointer"
        onClick={() => console.log("Captions button clicked")}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        GET NOW
      </motion.button>
    </div>
  );
};

/**
 * Merge Slide - Returns a div with the merge image and custom-placed buttons
 */
export const MergeSlide: React.FC = () => {
  return (
    <div className="min-w-full flex items-center justify-center relative">
      <motion.img
        src="/slides/merge_slide.png"
        alt="Merge Slide"
        className="rounded-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Custom positioned buttons for this slide */}
      <motion.button
        className="absolute font-bold w-[190px] h-[35px] bottom-[35px] left-[48px] bg-[#57FFB7] hover:bg-[#00ddff] text-white px-8  shadow-lg rounded-full cursor-pointer text-[13px] "
        onClick={() => console.log("Captions button clicked")}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        GET NOW
      </motion.button>
    </div>
  );
};

/**
 * Stream Slide - Returns a div with the stream image and custom-placed buttons
 */
export const StreamSlide: React.FC = () => {
  return (
    <div className="min-w-full flex items-center justify-center relative">
      <motion.img
        src="/slides/stream_slide.png"
        alt="Stream Slide"
        className="rounded-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Custom positioned buttons for this slide */}
      <motion.button
        className="absolute font-bold w-[190px] h-[35px] bottom-[35px] left-[48px] bg-[#57FFB7] hover:bg-[#00ddff] text-black px-8  shadow-lg rounded-full cursor-pointer text-[13px]"
        onClick={() => console.log("Captions button clicked")}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        GET NOW
      </motion.button>
    </div>
  );
};

/**
 * X Slide - Returns a div with the X image and custom-placed buttons
 */
export const XSlide: React.FC = () => {
  return (
    <div className="min-w-full flex items-center justify-center relative">
      <motion.img
        src="/slides/x_slide.png"
        alt="X Slide"
        className="rounded-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Custom positioned buttons for this slide */}
      <motion.button
        className="absolute font-bold w-[250px] h-[45px] bottom-[35px] right-[30px] bg-[#ffffff] hover:bg-[#000000] hover:text-white text-black px-8  shadow-lg rounded-full cursor-pointer text-[15px]"
        onClick={() => console.log("Captions button clicked")}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        GET NOW
      </motion.button>
    </div>
  );
};
