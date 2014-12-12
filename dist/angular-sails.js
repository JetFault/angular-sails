(function (angular, io) {
'use strict'/*global angular */
angular.module('ngSails', ['ng']);

/*jslint sloppy:true*/
/*global angular, io */
angular.module('ngSails').provider('$sails', function () {
    var provider = this,
        httpVerbs = ['get', 'post', 'put', 'delete'],
        eventNames = ['on', 'once'];

    var transformRequest = [],
      transformResponse = [];

    this.socketHostPort = undefined;
    this.socketOptions = undefined;

    this.responseHandler = undefined;

    /**
     * Add a Request Transform function, injectable
     *
     * Also, accepts returning a promise
     *
     * arguments will be:
     *  {
     *    data,
     *    method,
     *    url,
     *    headers
     *  }
     *
     * example:
     *  ```
     *    $sailsProvider.addRequestTransform(['$rootScope', function($rootScope) {
     *      return function(config) {
     *        config.data._token = 'blahblah';
     *
     *        return config;
     *      };
     *    }];
     *  ```
     */
    this.addRequestTransform = function(transformFxn) {
        transformRequest.push(transformFxn);
    };

    /**
     * Add a Response Transform function, injectable
     *
     * arguments will be:
     *  {
     *    data,
     *    jwr
     *  }
     *
     * example:
     *  ```
     *    $sailsProvider.addResponseTransform(['$rootScope', function($rootScope) {
     *      return function(response) {
     *        response.data.dueDate = new Date(response.data.dueDate);
     *        return response;
     *      };
     *    }];
     *  ```
     */
    this.addResponseTransform = function(transformFxn) {
        transformResponse.push(transformFxn);
    };

    this.$get = ['$q', '$timeout', '$injector', function ($q, $timeout, $injector) {
        var socket = io.connect(provider.socketHostPort, provider.socketOptions),
            resolveOrReject = this.responseHandler ? $injector.invoke(this.responseHandler) : function (deferred, data, jwr) {
                var resp = { data: data, jwr: jwr };

                //jwr.error = data.error;
                // Make sure what is passed is an object that has a status that is a number and if that status is no 2xx, reject.
                if (jwr && angular.isObject(jwr) &&
                    jwr.statusCode && !isNaN(jwr.statusCode) &&
                    Math.floor(jwr.statusCode / 100) !== 2)
                {
                      deferred.reject(resp);
                } else {
                    deferred.resolve(resp);
                }
            },
            angularify = function (cb, data) {
                $timeout(function () {
                    cb(data);
                });
            },
            promisify = function (methodName) {
                socket['legacy_' + methodName] = socket[methodName];
                socket[methodName] = function (url, data, headers) {
                    if (['put', 'post', 'patch', 'delete'].indexOf(methodName) !== -1) {
                        data = data || {};
                    }

                    var config = {
                        data: data,
                        method: methodName,
                        url: url,
                        headers: headers
                    };

                    var serverRequest = function(config) {
                        var deferred = $q.defer();
                        socket['legacy_' + config.method](config.url, config.data, function (result, jwr) {
                            resolveOrReject(deferred, result, jwr);
                        });
                        return deferred.promise;
                    };

                    // Handle Request and Response Transforms
                    var chain = [serverRequest],
                        promise = $q.when(config);

                    angular.forEach(provider.transformRequest, function (trans) {
                        chain.unshift(trans);
                    });
                    angular.forEach(provider.transformResponse, function (trans) {
                        chain.push(trans);
                    });

                    while (chain.length) {
                        promise = promise.then(chain.shift());
                    }

                    return promise;
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

        //Inject transformations
        angular.forEach(provider.transformRequest, function(trans) {
            trans = $injector.invoke(trans);
        });
        angular.forEach(provider.transformResponse, function(trans) {
            trans = $injector.invoke(trans);
        });

        angular.forEach(httpVerbs, promisify);
        angular.forEach(eventNames, wrapEvent);

        return socket;
    }];
});
}(angular, io));