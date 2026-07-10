const cv = require('@techstark/opencv-js');

cv.onRuntimeInitialized = () => {
  console.log("Mat:", typeof cv.Mat);
  const m = new cv.Mat(10, 10, cv.CV_8UC4);
  console.log("m size:", m.cols, m.rows);
  m.delete();
};
