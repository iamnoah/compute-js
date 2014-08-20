(function() {
	"use strict";

	function assertString(value, name) {
		if (typeof value !== "string") {
			throw new TypeError(name + " is not a string! : " + value);
		}
	}

	function asArray(iterable) {
		var result = [];
		(iterable || []).forEach(function(value) {
			result.push(value);
		});
		return result;
	}

	// define shims for Map and Sets. Our versions only support string
	// keys in Map and string values in sets.
	var global = (function() {
		/*jshint evil:true */
		return new Function("return this;");
	})()();

	var Map = (function() {
		if (global.Map) {
			return global.Map;
		}

		function Map(iterable) {
			Object.defineProperty(this, "__store", {
				configurable: false,
				enumerable: false,
				value: asArray(iterable).reduce(function(store, pair) {
					store[pair[0]] = store[pair[1]];
					return store;
				}, {}),
				writeable: true,
			});
		}

		Map.prototype.get = function(key) {
			assertString(key, "Map.get(key)");
			return this.__store[key];
		};
		Map.prototype.set = function(key, value) {
			assertString(key, "Map.set(key)");
			this.__store[key] = value;
			return this;
		};
		Map.prototype.has = function(key) {
			assertString(key, "Map.has(key)");
			return key in this.__store;
		};
		Map.prototype.delete = function(key) {
			assertString(key, "Map.delete(key)");
			delete this.__store[key];
		};
		Map.prototype.clear = function() {
			this.__store = {};
		};

		Map.prototype.forEach = function(iterator, context) {
			return Object.keys(this.__store).forEach(function(key) {
				iterator.call(context, this.get(key), key, this);
			}, this);
		};		

		Object.defineProperties(Map.prototype, {
			size: {
				get: function() {
					return Object.keys(this.__store).length;
				},
			},
		});

		return Map;
	})();

	var Set = (function() {
		if (global.Set) {
			return global.Set;
		}

		function Set(iterable) {
			Object.defineProperty(this, "__store", {
				configurable: false,
				enumerable: false,
				value: new Map(asArray(iterable).map(function(key) {
					return [key, true];
				})),
				writeable: true,
			});		
		}

		Set.prototype.add = function(key) {
			assertString(key, "Set.add(key)");
			this.__store.set(key, true);
			return this;
		};
		Set.prototype.clear = function() {
			this.__store = new Map();
		};
		Set.prototype.delete = function(key) {
			assertString(key, "Set.delete(key)");
			this.__store.delete(key);
		};
		Set.prototype.has = function(key) {
			assertString(key, "Set.has(key)");
			return this.__store.has(key);
		};

		Set.prototype.forEach = function(iterator, context) {
			this.__store.forEach(function(on, key) {
				iterator.call(context, key, key, this);
			}, this);
		};

		Object.defineProperties(Set.prototype, {
			size: {
				get: function() {
					return this.__store.size;
				},
			},
		});

		return Set;
	})();

	var wrapMethods = [
		"get",
		"set",
		"has",
		"delete",
		"clear",
		"forEach",
	];
	var wrapProps = ["size"];
	function MapWrapper(map) {
		this.map = map || new Map();
	}
	wrapMethods.forEach(function(method) {
		this[method] = function() {
			return this.map[method].apply(this.map, arguments);
		};
	}, MapWrapper.prototype);
	wrapProps.forEach(function(prop) {
		Object.defineProperty(this, prop, {
			get: function() {
				return this.map[prop];
			},
		});
	}, MapWrapper.prototype);

	module.exports = {
		asArray: asArray,
		Map: Map,
		Set: Set,
		MapWrapper: MapWrapper,
	};
})();
