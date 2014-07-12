(function() {
	"use strict";

	var compute = require("./compute");
	var Backbone = require("backbone");

	var bCompute = new compute.constructor();

	var get = Backbone.Model.prototype.get;
	var access;
	// override get to record what was accessed and provide an interface to bind
	Backbone.Model.prototype.get = function(attr) {
		if (access) {			
			var model = this;
			var id = this.cid + ":" + attr;
			access({
				onChange: function(listener) {
					model.on("change:" + attr, listener);
				},
				offChange: function(listener) {
					model.off("change:" + attr, listener);
				},
				computeName: (this.constructor.className ||
					this.constructor.name || "Model") + ":" + id,
			}, id);
		}
		return get.call(this, attr);
	};

	bCompute.connect({
		name: "backbone",
		record: function(fn, accessed) {
			var last = access;
			access = accessed;
			fn();
			access = last;
		}
	});

	module.exports = bCompute;
})();