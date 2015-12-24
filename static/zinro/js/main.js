// var zinroApp = angular.module('zinroApp', ['mgcrea.ngStrap.navbar', 'mgcrea.ngStrap.tab']);
var zinroApp = angular.module('zinroApp', ['mgcrea.ngStrap']);
console.log(homeurl);

function randomString(len) {
    // http://qiita.com/ryounagaoka/items/4736c225bdd86a74d59c
    var c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var cl = c.length;
    var r = "";
    for (var i = 0; i < len; i++) {
        r += c[Math.floor(Math.random()*cl)];
    }
    return r;
};

function get_zinrokey() {
    var zinrokey = localStorage.getItem("zinrokey");
    if (!zinrokey) {
        zinrokey = randomString(32);
        localStorage.setItem("zinrokey", zinrokey);
    }
    return zinrokey
}
            
            
zinroApp.controller('ZinroCtrl', function($scope) {
    var io_game = io.connect(homeurl + "/game");
    io_game.on('status', function(data) {
        $scope.village_state = data.village_state;
        $scope.villagers = data.villagers;  // 村民一覧  alive:false で死亡
        console.log(data);   
    });
    io_game.on('villager', function(data) {
        console.log(data);   
    });
    io_game.on('werewolf', function(data) {
        console.log(data);   
    });
    io_game.json.emit('get_status', { key: get_zinrokey() });
    
    //io_game.emit('villager', "TEST IO!");
    //io_game.emit('werewolf', "WOLF IO!");
    //io_game.emit('villager', "Villager IO!");

    $scope.tabs =  [
        {
            "title": "状態"
        },
        {
            "title": "村民会"
        },
        {
            "title": "人狼会"
        },
        {
            "title": "投票"
        }
    ]
    $scope.tabs.activeTab = "状態";
});


zinroApp.controller('VillageCtrl', function($scope, $http) {
    $scope.village = {}     // 初期値は前回の状態を反映
    $scope.initVillage = function() {
        $http.post(
            '/init_village', $scope.village
        ).success(function(data) {
            console.log("posted successfully");
            window.location.href = '/zinro';
        }).error(function(data) {
            console.error("error in posting");
        })
    };
    $scope.destroyVillage = function() {
        $http.post(
            '/destroy_village'
        ).success(function(data) {
            console.log("posted successfully");
            window.location.reload(true);
        }).error(function(data) {
            console.error("error in posting");
        })
    };
    $scope.joinVillage = function() {
        window.location.href = '/zinro';
    };
});


// http://codepen.io/MehmetCanker/pen/jluqp
zinroApp.controller('CounterCtrl', ['$scope', '$timeout', function($scope, $timeout) {
    $scope.counter = 100;
    var stopped;
    $scope.countdown = function() {
        stopped = $timeout(function() {
            if ($scope.counter > 0) {
                $scope.counter--;
            }
            $scope.countdown();
        }, 1000);
    };
    $scope.stop = function() {
        $timeout.cancel(stopped);
    };
}]);



// http://jsfiddle.net/jaredwilli/SfJ8c/
zinroApp.directive('resize', function ($window) {
    return function (scope, element) {
        var w = angular.element($window);
        scope.getWindowDimensions = function () {
            return {
                'h': w.height(),
                'w': w.width()
            };                              
        };
        scope.$watch(scope.getWindowDimensions, function (newValue, oldValue) {
            scope.windowHeight = newValue.h;
            scope.windowWidth = newValue.w;
            scope.style = function () {
                return {
                    'height': (newValue.h - 100) + 'px',
                    'width': (newValue.w - 100) + 'px'
                };
            };
        }, true);
        w.bind('resize', function () {
            scope.$apply();
        });
    }
})

