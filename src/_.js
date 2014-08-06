(function() {
	"use strict";

	var slice = [].slice;

	exports.difference = function(array, toRemove) {
		return array.filter(function(value) {
			return !~toRemove.indexOf(value);
		});
	};
	exports.each = function(obj, iterator, ctx) {
		if (!obj) {
			return;
		}
		if (obj.forEach) {
			return obj.forEach(iterator, ctx);
		} else {
			Object.keys(obj || {}).forEach(function(key) {
				iterator.call(this, obj[key], key);
			}, ctx);
		}
	};
	exports.extend = function() {
		var objs = exports.toArray(arguments);
		var target = objs.shift();
		objs.forEach(function(obj) {
			exports.each(obj, function(value, key) {
				target[key] = value;
			});
		});
		return target;
	};
	exports.flatten = function(array) {
		if (!Array.isArray(array)) {
			return [array];
		}
		var result = [];
		array.forEach(function(item) {
			result.push.apply(result, exports.flatten(item));
		});
		return result;
	};
	exports.toArray = function(arg) {
		return slice.call(arg || []);
	};
	exports.uniq = function(array) {
		return exports.toArray(array).filter(function(value, i) {
			return !~array.slice(0, i).indexOf(value);
		});
	};

})();