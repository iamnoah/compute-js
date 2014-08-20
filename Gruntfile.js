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
      tests: {
        options: {
          bundleOptions: {
            debug: true,
          }
        },
        src: "test/suite.js",
        dest: "dist/browserified-tests.js"
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
    },
    watch: {
      tests: {          
        files: ["test/**/*.js", "src/**/*.js"],
        tasks: ["browserify:tests"],
        options: {
          livereload: true,
        },
      },
    },
    connect: {
      tests: {
        options: {
          port: 2345,
          livereload: true,
        }
      }
    },
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-simple-mocha');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-connect');

  // Default task.
  grunt.registerTask('tests', ['connect:tests', 'watch:tests']);

  grunt.registerTask('default', ['simplemocha:all',
      "browserify:compute",
      "browserify:backboneCompute"]);

};
