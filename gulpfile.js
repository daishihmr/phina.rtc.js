const gulp = require("gulp");

gulp.task("build", () => {
  gulp.src("src/*").pipe(gulp.dest('./build'));
});

gulp.task("default", ["build"]);