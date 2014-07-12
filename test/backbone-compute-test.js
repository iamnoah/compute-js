/*global describe, it*/
"use strict";
var compute = require("../src/backbone-compute");
var Backbone = require("backbone");
require("should");

describe("backbone compute", function() {

	it("should bind to changes in a backbone model", function() {
		var Foo = Backbone.Model.extend({
			result: function() {
				return this.get("foo") + this.get("bar");
			},
		}, {
			className: "Foo",
		});

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

		var graph = {};
		graph["backbone:Foo:" + f.cid + ":foo"] = true;
		graph["backbone:Foo:" + f.cid + ":bar"] = true;
		c.graph().should.eql(graph);
	});

});