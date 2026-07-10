const cv = require('@techstark/opencv-js');
console.log(typeof cv);
if (typeof cv === 'function') {
  console.log("It's a function");
}
console.log(Object.keys(cv).slice(0, 5));
