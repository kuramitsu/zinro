// var zinroApp = angular.module('zinroApp', ['mgcrea.ngStrap.navbar', 'mgcrea.ngStrap.tab']);
var zinroApp = angular.module('zinroApp', ['mgcrea.ngStrap']);

console.log(homeurl);
            

//io_game.json.emit('emit_from_client', {

zinroApp.controller('ZinroCtrl', function($scope) {

    var io_game = io.connect(homeurl + "/game");
    io_game.on('status', function(data) {
        $scope.village_state = data.village_state;
        console.log(data);   
    })
    io_game.on('villager', function(data) {
        console.log(data);   
    })
    io_game.on('werewolf', function(data) {
        console.log(data);   
    })
    io_game.json.emit('get_status', {key:"abcdefg"});
    io_game.emit('villager', "TEST IO!");
    io_game.emit('werewolf', "WOLF IO!");
    io_game.emit('villager', "Villager IO!");

    $scope.tabs =  [
        {
            "title": "状態",
            "content": "HOME CONTENT"
        },
        {
            "title": "村民会",
            "content": "HOME CONTENT"
        },
        {
            "title": "人狼会",
            "content": "PROFILE CONTENT<hr><h1>TEST</h1>"
        },
        {
            "title": "投票",
            "content": "投票！"
        }
    ]
    $scope.tabs.activeTab = "1";
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

