/*jslint sloppy:true*/
/*global angular, io */
angular.module('ngSails').provider('$sails', function () {
    var provider = this,
        httpVerbs = ['get', 'post', 'put', 'delete'],
        eventNames = ['on', 'once'];

    var transformRequest = [],
        transformResponse = [];

    /**
     * 'host:port' string to connect to
     */
    this.socketHostPort = undefined;

    /**
     * socket options to send to `io.connect`
     */
    this.socketOptions = undefined;

    /**
     * Should the socket autoconnect on first injection
     */
    this.autoConnect = io.sails.autoConnect;

    /**
     * Response Handler (first thing run after getting a server response)
     * Figures out whether to reject or resolve the promise based on the statusCode
     *
     * Should return a value if successful or `$q.reject` on rejection
     *
     * arguments will be:
     * @param {JSON} result result of socket call
     * @param {JSON} jwt Entire JWT response from server
     *
     * @example (also default implementation)
     *  ```
     *    $sailsProvider.resolveOrRejectHandler = ['', function() {
     *      return function (data, jwr) {
     *        var resp = { data: data, jwr: jwr };
     *
     *        // Make sure what is passed is an object that has a status that is a number and if that status is no 2xx, reject.
     *        if (jwr && angular.isObject(jwr) && jwr.statusCode && !isNaN(jwr.statusCode) && Math.floor(jwr.statusCode / 100) !== 2) {
     *          return $q.reject(resp);
     *        } else {
     *          return resp;
     *        }
     *      };
     *    }];
     */
    this.resolveOrRejectHandler = undefined;

    /**
     * Add a Request Transform function, injectable
     *
     * Also, accepts returning a promise
     *
     * arguments will be:
     * @param {JSON} config
     *  {
     *    data,
     *    method,
     *    url,
     *    headers
     *  }
     *
     * @example:
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
        var socket,
            resolveOrReject,
            connectDefer = $q.defer();

        if (provider.autoConnect) {
            connectRawSocket();
        }

        function connectRawSocket() {
            socket.rawSocket = io.connect(provider.socketHostPort, provider.socketOptions);
            connectDefer.resolve(socket);
        }

        function disconnectRawSocket() {
            socket.rawSocket.disconnect();

            // Reset rawSocket, re-init new connection Defer
            socket.rawSocket = null;
            connectDefer = $q.defer();
        }

        resolveOrReject = function (data, jwr) {
            var resp = { data: data, jwr: jwr };

            //jwr.error = data.error;
            // Make sure what is passed is an object that has a status that is a number and if that status is no 2xx, reject.
            if (jwr && angular.isObject(jwr) && jwr.statusCode && !isNaN(jwr.statusCode) && Math.floor(jwr.statusCode / 100) !== 2) {
                return $q.reject(resp);
            } else {
                return resp;
            }
        };

        // Overwrite default resolve or rejector
        if (provider.rejectOrResolveHandler) {
            resolveOrReject = $injector.invoke(this.rejectOrResolveHandler);
        }

        function methodFunctions(methodName) {
            var socket = this;
            socket[methodName] = function (url, data, headers) {
                // Must call `$sails.connect` before actually calling any methods
                if (!socket.rawSocket) {
                  return $q.reject(new SocketNotConnectedException());
                }

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
                    socket.rawSocket[config.method](config.url, config.data, function (result, jwr) {
                        $q.when(resolveOrReject(result, jwr))
                        .then(function(res) {
                            deferred.resolve(res);
                        })
                        .catch(function(err) {
                            deferred.reject(err);
                        });
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
        }

        function eventFunctions(eventName) {
            var socket = this;
            socket[eventName] = function (event, cb) {
                // Add the events 'after' the socket connects
                connectDefer.promise
                .then(function() {
                    if (cb !== null && angular.isFunction(cb)) {
                        socket.rawSocket[eventName](event, function (result) {
                            $timeout(function () {
                                cb(result);
                            });
                        });
                    }
                });
            };
        }

        //Inject transformations
        angular.forEach(provider.transformRequest, function(trans) {
            trans = $injector.invoke(trans);
        });
        angular.forEach(provider.transformResponse, function(trans) {
            trans = $injector.invoke(trans);
        });

        angular.forEach(httpVerbs, methodFunctions.bind(socket));
        angular.forEach(eventNames, eventFunctions.bind(socket));

        socket.connect = function() {
          connectRawSocket();
        };

        socket.disconnect = function() {
          disconnectRawSocket();
        };

        return socket;

        function SocketNotConnectedException() {
          this.name = 'SocketNotConnectedException';
          this.message = 'Socket has not been connected before attempting to run a socket request';
        }
        SocketNotConnectedException.prototype = new Error();

    }];
});
