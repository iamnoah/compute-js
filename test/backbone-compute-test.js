/*global describe, it*/
"use strict";
var compute = require("../src/backbone-compute");
var Backbone = require("backbone");
require("should");

describe("backbone compute", function() {
	var Foo = Backbone.Model.extend({
		result: function() {
			return this.get("foo") + this.get("bar");
		},
	}, {
		className: "Foo",
	});

	it("should bind to changes in a backbone model", function() {
		var f = new Foo({
			foo: 123,
			bar: 321,
		});

		var c = compute(function() {
			return f.result() / 4;
		});

		c().should.eql(111);

		var changed = false;
		function expect10() {
			changed = true;
			c().should.eql(10);
		}
		c.onChange(expect10);

		f.set("foo", -281);
		changed.should.be.true;

		c.offChange(expect10);
		// expect10 will fail if still bound
		f.set("bar", 1);
		c().should.eql(-70);

		// TODO
		// var graph = {};
		// graph["connected:0:" + f.cid + ":foo"] = {
		// 	name: "backbone:Foo:" + f.cid + ":foo",
		// };
		// graph["connected:0:" + f.cid + ":bar"] = {
		// 	name: "backbone:Foo:" + f.cid + ":bar",
		// };
		// c.graph().should.eql(graph);
	});

	it("should bind to any change when the model is serialized", function() {
		var f = new Foo({
			foo: 123,
			bar: 321,
		});

		var c = compute(function() {
			return f.values().reduce(function(sum, i) {
				return sum + i;
			}, 0);
		});

		c().should.eql(444);

		var changed = false;
		function expect10() {
			changed = true;
			c().should.eql(10);
		}
		c.onChange(expect10);
		
		f.set("foo", -311);
		changed.should.be.true;

		c.offChange(expect10);
		// expect10 will fail if still bound
		f.set("bar", 312);
		c().should.eql(1);

		// test toJSON
		c = compute(function() {
			return f.toJSON().foo;
		});
		changed = false;
		c.onChange(expect10);
		
		f.set("foo", 10);
		changed.should.be.true;
	});
});