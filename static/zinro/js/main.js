// var zinroApp = angular.module('zinroApp', ['mgcrea.ngStrap.navbar', 'mgcrea.ngStrap.tab']);
var zinroApp = angular.module('zinroApp', ['mgcrea.ngStrap']);
console.log(homeurl);

var rolecmds = {
    村人: {
        昼: ["状態", "村会", "投票"],
        夜: ["状態", "村会"]
    },
    人狼: {
        昼: ["状態", "村会", "投票"],
        夜: ["状態", "村会", "狼会", "噛む"]
    },
    占い師: {
        昼: ["状態", "村会", "投票"],
        夜: ["状態", "村会", "占う"]
    },
    狂人: {
        昼: ["状態", "村会", "投票"],
        夜: ["状態", "村会"]
    },
    狩人: {
        昼: ["状態", "村会", "投票"],
        夜: ["状態", "村会", "守る"]
    }
}
function getCmds(role, phase) {
    if (role in rolecmds) {
        if (phase in rolecmds[role]) {
            return rolecmds[role][phase];
        }
    }
    return [];
}

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

function getZinrokey() {
    var zinrokey = localStorage.getItem("zinrokey");
    if (!zinrokey) {
        zinrokey = randomString(32);
        localStorage.setItem("zinrokey", zinrokey);
    }
    return zinrokey
}
function getJoinname() {
    var joinname = localStorage.getItem("joinname");
    if (!joinname) {
        joinname = "";
    }
    return joinname;
}
 
function goBottom(targetId) {
    var obj = document.getElementById(targetId);
    if (!obj) return;
    obj.scrollTop = obj.scrollHeight;
}

function getChatboxHeight() {
    var _window = window.innerHeight;
    var _header = 50;
    var _tab = 60;
    var _form = 35;
    // var _header = document.getElementById("navheader").clientHeight;
    // var _form = document.getElementById("vform").clientHeight;
    console.log(_window);
    console.log(_header);
    console.log(_form);
    return _window - _header - _tab - _form;
}


   
// 配列アノテーション http://www.buildinsider.net/web/angularjstips/0004
// https://docs.angularjs.org/api/ng/service/$interval
// http://blog.morizotter.com/2014/04/08/javascript-setinterval-settimeout/
zinroApp.controller('ZinroCtrl', ["$scope", "$interval", function($scope, $interval) {
    // メニューバー用　http://rails.honobono-life.info/Tutorial_Bootstrap3_AngularJS_NavMenu
    $scope.isCollapsed = true;

    // 通信関連
    var io_game = io.connect(homeurl + "/game");
    io_game.on('status', function(data) {
        $scope.village = data.village;
        $scope.village_state = data.village_state;
        $scope.villagers = data.villagers;  // 村民一覧  alive:false で死亡
        $scope.time = data.village_state.time;
        $scope.wantnum = data.wantnum;
        console.log(data);
        if (data.reset) { // もろもろ初期化
            $scope.user = undefined;
            $scope.villager_remarks = [];
            $scope.werewolf_remarks = [];
        }
        if ($scope.user) { // cmds更新
            $scope.cmds = getCmds($scope.user.role, $scope.village_state.phase);
            console.log($scope.cmds);
        }
        // 
        if (data.votetargets) {  // 投票先
            $scope.votetargets = data.votetargets;   
        }
        if (data.bite) {  // 噛まれ先

        }
    });
    io_game.on('vote', function(data) {
        
    });
    io_game.on('time', function(data) {
        $scope.time = data;
        console.log(data);
    });
    io_game.on('user', function(data) {
        $scope.user = data;
        $scope.cmds = getCmds($scope.user.role, $scope.village_state.phase);
        console.log(data);
    });
    io_game.on('villager', function(data) {
        console.log(data);   
        $scope.villager_remarks.push(data);
        setTimeout(function () {
            goBottom("vchatbox");
        }, 800);
    });
    io_game.on('werewolf', function(data) {
        console.log(data);   
        $scope.werewolf_remarks.push(data);
        setTimeout(function () {
            goBottom("wchatbox");
        }, 800);
    });
    // 村民登録関連
    $scope.joinname = getJoinname();
    $scope.joinVillage = function () {
        console.log($scope.joinname);
        io_game.json.emit('join', {
            key: getZinrokey(),
            name: $scope.joinname 
        });
        localStorage.setItem("joinname", $scope.joinname);
    };
    
    // 投票
    $scope.votetarget = "";  // 投票先
    $scope.votetargets = [];
    $scope.vote = function() {
        if (!$scope.votetarget) {
            return;
        }
        io_game.json.emit('vote', {
            key: getZinrokey(),
            target: $scope.votetarget  
        });
    };
    
    $scope.bite = {};  // 日ごとの噛み先

    // コマンド
    $scope.cmds =  [];
    
    // Chat関連
    $scope.villagertext = "";
    $scope.werewolftext = "";
    $scope.sendVillager = function () {
        if (! $scope.villagertext) {     // 空文字の送信はしない
            return; 
        }
        console.log("send to room_villager");
        var _data = {
            key: getZinrokey(),
            msg: $scope.villagertext
        }
        io_game.emit('villager', _data);
        $scope.villagertext = "";
    };
    $scope.sendWerewolf = function () {
        if (! $scope.werewolftext) {     // 空文字の送信はしない
            return; 
        }
        console.log("send to room_werewolf");
        var _data = {
            key: getZinrokey(),
            msg: $scope.werewolftext
        }
        io_game.emit('werewolf', _data);
        $scope.werewolftext = "";
    };
    $scope.villager_remarks = [];   // 村人チャットの発言一覧
    $scope.werewolf_remarks = [];   // 人狼チャットの発言一覧
    
    // 初期状態の取得
    io_game.json.emit('get_status', { key: getZinrokey() });

    // Timer処理
    var stopped;
    $scope.countdown = function() {
        stopped = $interval(function() {
            if ($scope.time > 0) {
                $scope.time--;
            }
        }, 1000);
    };
    $scope.countstop = function() {
        $interval.cancel(stopped);
    };

    //io_game.emit('villager', "TEST IO!");
    //io_game.emit('werewolf', "WOLF IO!");
    //io_game.emit('villager', "Villager IO!");

    
    /*
    [
        {
            "title": "状態"
        },
        {
            "title": "村会"
        },
        {
            "title": "狼会"
        },
        {
            "title": "投票"
        },
        {
            "title": "噛む"
        }
    ]
    */
    // $scope.cmds.activeTab = "状態";
    
    // Style関連
    console.log($scope.style_chatbox);
    $scope.style_chatbox = {
        height: getChatboxHeight() + "px"
    };
    console.log($scope.style_chatbox);
    var resizeTimer = false;
    window.addEventListener('resize', function (event) {
        if (resizeTimer !== false) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(function () {
            $scope.style_chatbox.height = getChatboxHeight() + "px";
            console.log($scope.style_chatbox);
        }, 500);
    });
}]);


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

