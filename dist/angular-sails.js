(function (angular, io) {
'use strict'/*global angular */
angular.module('ngSails', ['ng']);

/*jslint sloppy:true*/
/*global angular, io */
angular.module('ngSails').provider('$sails', function () {
    var provider = this,
        httpVerbs = ['get', 'post', 'put', 'delete'],
        eventNames = ['on', 'once'];

    this.url = undefined;
    this.interceptors = [];
    this.responseHandler = undefined;

    this.$get = ['$q', '$timeout', function ($q, $timeout) {
        var socket = io.connect(provider.url),
            defer = function () {
                var deferred = $q.defer(),
                    promise = deferred.promise;

                promise.success = function (fn) {
                    promise.then(fn);
                    return promise;
                };

                promise.error = function (fn) {
                    promise.then(null, fn);
                    return promise;
                };

                return deferred;
            },
            resolveOrReject = this.responseHandler || function (deferred, data, jwr) {
                jwr.error = data.error;
                // Make sure what is passed is an object that has a status that is a number and if that status is no 2xx, reject.
                if (jwr && angular.isObject(jwr) && jwr.statusCode && !isNaN(jwr.statusCode) && Math.floor(jwr.statusCode / 100) !== 2) {
                    deferred.reject(jwr);
                } else {
                    deferred.resolve(data);
                }
            },
            angularify = function (cb, data) {
                $timeout(function () {
                    cb(data);
                });
            },
            promisify = function (methodName) {
                socket['legacy_' + methodName] = socket[methodName];
                socket[methodName] = function (url, data, cb) {
                    var deferred = defer();
                    if (cb === undefined && angular.isFunction(data)) {
                        cb = data;
                        data = null;
                    }
                    deferred.promise.then(cb);
                    socket['legacy_' + methodName](url, data, function (result, jwr) {
                        resolveOrReject(deferred, result, jwr);
                    });
                    return deferred.promise;
                };
            },
            wrapEvent = function (eventName) {
                socket['legacy_' + eventName] = socket[eventName];
                socket[eventName] = function (event, cb) {
                    if (cb !== null && angular.isFunction(cb)) {
                        socket['legacy_' + eventName](event, function (result) {
                            angularify(cb, result);
                        });
                    }
                };
            };

        angular.forEach(httpVerbs, promisify);
        angular.forEach(eventNames, wrapEvent);

        return socket;
    }];
});
}(angular, io));