/*global module:false*/
module.exports = function(grunt) {
  "use strict";
  // Project configuration.
  grunt.initConfig({
    // Task configuration.
    simplemocha: {
      options: {
        globals: ['should'],
        timeout: 3000,
        ignoreLeaks: false,
        ui: 'bdd',
        reporter: 'tap'
      },

      all: { src: ['test/**/*.js'] }
    },
    browserify: {
      compute: {
        options: {
          bundleOptions: {
            standalone: "computejs",
          },
        },
        src: "src/compute.js",
        dest: "dist/compute.js"
      },
      backboneCompute: {
        options: {
          bundleOptions: {
            standalone: "computejs.backbone",
          },
        },
        src: "src/backbone-compute.js",
        dest: "dist/backbone-compute.js"
      },
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-simple-mocha');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Default task.
  grunt.registerTask('default', ['simplemocha:all',
      "browserify:compute",
      "browserify:backboneCompute"]);

};