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

	function asObject(iterable) {
		var result = {};
		(iterable || []).forEach(function(value, key) {
			result[key] = value;
		});
		return result;
	}

	// define shims for Map and Sets. Our versions only support string
	// keys in Map and string values in sets.
	var global = (function() {
		/*jshint evil:true */
		return new Function("return this;");
	})()();


	// Chrome's Set and Map do not create entries from the argument
	function shimMap(Map) {
		var map = new Map([
			["uses", "array"],
			["to", "constructor"],
		]);

		if (map.get("uses") !== "array") {
			return function(iterable) {
				var m = new Map();
				asArray(iterable).forEach(function(pair) {
					m.set(pair[0], pair[1]);
				});
				return m;
			};
		}

		return Map;
	}

	function shimSet(Set) {
		var set = new Set("uses", "array", "to", "constructor");

		if (set.size !== 4 || !set.has("to")) {
			return function(iterable) {
				var s = new Set();
				asArray(iterable).forEach(function(value) {
					s.add(value);
				});
				return s;
			};
		}

		return Set;
	}

	var Map = (function() {
		// XXX the Chrome 36 implementation of Sets somehow is inserting 
		// undefineds (despite never calling add() with undefined)
		// May be a bug in the Map
		// if (global.Map) {
		// 	return shimMap(global.Map);
		// }

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
			this.size = Object.keys(this.__store).length;
		}

		Map.prototype.get = function(key) {
			assertString(key, "Map.get(key)");
			return this.__store[key];
		};
		Map.prototype.set = function(key, value) {
			assertString(key, "Map.set(key)");
			if (!this.has(key)) {
				this.size++;
			}
			this.__store[key] = value;
		};
		Map.prototype.has = function(key) {
			assertString(key, "Map.has(key)");
			return key in this.__store;
		};
		Map.prototype.delete = function(key) {
			assertString(key, "Map.delete(key)");
			if (this.has(key)) {
				this.size--;
			}
			delete this.__store[key];
		};
		Map.prototype.clear = function() {
			this.size = 0;
			this.__store = {};
		};

		Map.prototype.forEach = function(iterator, context) {
			return Object.keys(this.__store).forEach(function(key) {
				iterator.call(context, this.get(key), key, this);
			}, this);
		};

		return Map;
	})();

	var Set = (function() {
		// XXX the Chrome 36 implementation of Sets somehow is inserting 
		// undefineds (despite never calling add() with undefined)
		// may be a bug in the Map
		// if (global.Set) {
		// 	return shimSet(global.Set);
		// }

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
		asObject: asObject,
		Map: Map,
		Set: Set,
		MapWrapper: MapWrapper,
	};
})();
