(function() {
	"use strict";

	var compute = require("./compute");
	var Backbone = require("backbone");

	var bCompute = new compute.constructor();

	var access;
	bCompute.connect({
		// name will be used for namespacing and vizualization
		// but is optional
		name: "backbone",
		/**
		 * Record is required.
		 * @param fn {function} the computed function. Invoke it when you are
		 * ready to record access.
		 * @param accessed {function(bindable, uniqueId)} Call for each 
		 * Observable that is acccessed while fn is executing.
		 */
		record: function(fn, accessed) {
			// set the access function that will be called by all invocations 
			// of model.get
			var last = access;
			access = accessed;
			fn();
			access = last;
		}
	});

	var attrMethods = ['get', 'has'];
	attrMethods.forEach(function(method) {
		var original = Backbone.Model.prototype[method];
		// override get to record what was accessed
		Backbone.Model.prototype[method] = function(attr) {
			if (access) {
				var model = this;
				// id *must* uniquely identify the value being observed across
				// the whole app. Try to make them consistent or you will get
				// more onChange/offChange thrashing, which can hurt performance.
				var id = this.cid + ":" + attr;
				/**
				 * @class Observable
				 * access needs the ability to start and stop observing the
				 * value(s) that are accessed.
				 */
				access({
					/**
					 * Required.
					 * @param listener {function} called when the value changes.
					 */
					onChange: function(listener) {
						model.on("change:" + attr, listener);
					},
					/**
					 * Required.
					 * @param listener {function} the listener to unsubscribe.
					 */
					offChange: function(listener) {
						model.off("change:" + attr, listener);
					},
					// optional but useful in viz
					computeName: (this.constructor.className ||
						this.constructor.name || "Model") + ":" + id,
				}, id);
			}
			return original.call(this, attr);
		};
	});


	// for any access that reads (potentially) the whole model, bind to the 
	// general change event
	var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit', 'toJSON'];
	modelMethods.forEach(function(method) {
		var original = Backbone.Model.prototype[method];
		Backbone.Model.prototype[method] = function() {
			if (access) {				
				var model = this;
				access({
					onChange: function(listener) {
						model.on("change", listener);
					},
					offChange: function(listener) {
						model.off("change", listener);
					},
					computeName: (this.constructor.className ||
						this.constructor.name || "Model") + ":change",
				}, this.cid);			
			}
			return original.apply(this, arguments);
		};
	});

	module.exports = bCompute;
})();