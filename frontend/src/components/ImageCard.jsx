import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Renders a single image card with its thumbnail and filename.
 *
 * @param {object} props - The component props.
 * @param {object} props.image - The image object containing details like id, filename, and meta.
 */
const ImageCard = ({ image, onContextMenu }) => {
  // The logic is now much simpler. The backend provides the correct URL,
  // whether it's a placeholder or the actual thumbnail.
  const thumbnailUrl = image.thumbnail_url;

  const flipVariants = {
    initial: { rotateY: 90, opacity: 0 },
    animate: { rotateY: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { rotateY: -90, opacity: 0, transition: { duration: 0.3 } },
  };

  const Spinner = () => (
    <motion.div
      key="spinner"
      className="thumbnail-spinner"
      variants={flipVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="spinner-icon"></div>
    </motion.div>
  );

  return (
    <motion.div
      className="image-card-inner"
      style={{ perspective: '1000px' }}
      whileHover={{ scale: 1.1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 50 }}
    >
      <AnimatePresence initial={false}>
        {image.thumbnail_missing ? (
          <Spinner />
        ) : (
          <motion.img
            key="thumbnail"
            src={thumbnailUrl}
            alt={image.filename}
            loading='lazy'
            className="thumbnail"
            onContextMenu={(e) => {
              onContextMenu(e, image);
            }}
            variants={flipVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ImageCard;
