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
    },
    妖狐: {
        昼: ["状態", "村会", "投票"],
        夜: ["状態", "村会"]
    },
    観測者: {
        昼: ["状態", "村会"],
        夜: ["状態", "村会"]   
    },
    死者: {
        昼: ["状態", "村会"],
        夜: ["状態", "村会"]   
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
    return _window - _header - _tab - _form;
}
function getAliveOthers(villagers, me) {
    var _names = [];
    for (var i = 0, len = villagers.length; i < len; i++) {
        var v = villagers[i];
        if (v.alive && v.name != me) {
            _names.push(v.name);
        }
    }
    return _names;
}
function getAliveHumans(villagers, werewolves) {
    var _names = [];
    werewolves = werewolves || [];
    for (var i = 0, len = villagers.length; i < len; i++) {
        var v = villagers[i];
        if (v.alive) {
            if (werewolves.indexOf(v.name) < 0) {  // 人狼ではない
                _names.push(v.name);   
            }
        }
    }
    return _names;
}

   
// 配列アノテーション http://www.buildinsider.net/web/angularjstips/0004
// https://docs.angularjs.org/api/ng/service/$interval
// http://blog.morizotter.com/2014/04/08/javascript-setinterval-settimeout/
zinroApp.controller('ZinroCtrl', ["$scope", "$interval", function($scope, $interval) {
    // 投票関連
    $scope.votetarget = "";  // 投票先
    $scope.votetargets = [];
    $scope.voteselected = undefined;
    $scope.vote = function() {
        if (!$scope.votetarget) {
            return;
        }
        io_game.json.emit('vote', {
            key: getZinrokey(),
            target: $scope.votetarget  
        });
    };
    $scope.votestatus = {};      // 日 => status
    // 噛み関連
    $scope.bitetarget = "";  // 噛み先
    $scope.bitetargets = [];
    $scope.biteselected = undefined;
    $scope.bite = function() {
        if (!$scope.bitetarget) {
            return;
        }
        io_game.json.emit('bite', {
            key: getZinrokey(),
            target: $scope.bitetarget  
        });
    };
    $scope.victim = {};     // 日 => 名前一覧（噛まれた OR 占われた）
    // 守り関連
    $scope.guardtarget = "";  // 噛み先
    $scope.guardtargets = [];
    $scope.guardselected = undefined;
    $scope.guard = function() {
        if (!$scope.guardtarget) {
            return;
        }
        io_game.json.emit('guard', {
            key: getZinrokey(),
            target: $scope.guardtarget  
        });
    };
    // 占い関連
    $scope.divinetarget = "";   // 占い先
    $scope.divinetargets = [];
    $scope.divinestatus = {};  // 日 => {name, divination}
    $scope.divine = function() {
        if (!$scope.divinetarget) {
            return;
        }
        io_game.json.emit('divine', {
            key: getZinrokey(),
            target: $scope.divinetarget  
        });
    };

    // 通信関連
    var io_game = io.connect(homeurl + "/game");
    io_game.on('status', function(data) {
        $scope.village = data.village;
        $scope.village_state = data.village_state;
        $scope.villagers = data.villagers;  // 村民一覧  alive:false で死亡
        $scope.time = data.village_state.time;
        $scope.wantnum = data.wantnum;
        $scope.gamestatus = data.gamestatus;
        console.log(data);
        if (data.reset) { // もろもろ初期化
            $scope.user = undefined;
            $scope.villager_remarks = [];
            $scope.werewolf_remarks = [];
            $scope.votetarget = "";
            $scope.votetargets = [];
            $scope.voteselected = undefined;
            $scope.werewolves = [];
            $scope.bitetarget = ""; 
            $scope.bitetargets = [];
            $scope.biteselected = undefined;
            $scope.guardtarget = ""; 
            $scope.guardtargets = [];
            $scope.guardselected = undefined;
            $scope.votestatus = {};   // 吊られた人
            $scope.victim = {};      // 噛まれた人
            $scope.divinetarget = "";
            $scope.divinetargets = [];
            $scope.divinestatus= {};    // 占われた人
            $scope.gamestatus = undefined;
        }
        // ユーザー情報取得が間に合わんか？ 報告フェーズでいけるとは思うが
        io_game.json.emit('get_user', { key: getZinrokey() });

        switch (data.village_state.phase) {
            case "昼":
                // 生きてる人を投票対象にする
                $scope.voteselected = undefined;
                if ($scope.user) {
                    $scope.votetargets = getAliveOthers($scope.villagers, $scope.user.name);
                } else {
                    $scope.votetargets = getAliveOthers($scope.villagers);
                }
                break;
            case "吊":
                $scope.votestatus = data.votestatus;   // 投票情報
                break;
            case "夜":
                if ($scope.user && $scope.user.role == "人狼") {   // 人狼なら
                    $scope.biteselected = undefined;
                }
                if ($scope.user && $scope.user.role == "占い師") {   // 占い師なら
                    $scope.divinetargets = getAliveOthers($scope.villagers, $scope.user.name);
                }
                if ($scope.user && $scope.user.role == "狩人") {   // 狩人なら
                    $scope.guardtargets = getAliveOthers($scope.villagers, $scope.user.name);
                    $scope.guardselected = undefined;
                }
                break;
            case "噛":
                $scope.victim = data.victim;      // 噛まれた人
                break;
        }
        if ($scope.user) { // cmds更新
            if ($scope.user.alive) {
                $scope.cmds = getCmds($scope.user.role, $scope.village_state.phase);
            } else {
                $scope.cmds = getCmds("死者", $scope.village_state.phase);
            }
            if ($scope.cmds.length > 0) {
                $scope.cmds.activeTab = "状態";
            }
        }
    });
    io_game.on('werewolfstatus', function(data) {
        $scope.werewolves = data.werewolves;
        $scope.bitetargets = getAliveHumans($scope.villagers, $scope.werewolves);
    });
    io_game.on('voteselected', function(data) {
        $scope.voteselected = data;
    });
    io_game.on('biteselected', function(data) {
        $scope.biteselected = data;
    });
    io_game.on('guardselected', function(data) {
        $scope.guardselected = data;
    });
    io_game.on('divinestatus', function(data) {
        $scope.divinestatus = data; 
    });
    io_game.on('time', function(data) {
        $scope.time = data;
    });
    io_game.on('user', function(data) {
        $scope.user = data;
        if ($scope.user.alive) {    // 生きてる
            $scope.cmds = getCmds($scope.user.role, $scope.village_state.phase);
            $scope.style_body = {
                "background-color": "white"
            };
        } else {    // 死んでる
            $scope.cmds = getCmds("死者", $scope.village_state.phase);
            $scope.style_body = {
                "background-color": "red"
            };
        }
    });
    io_game.on('villager', function(data) {
        $scope.villager_remarks.push(data);
        setTimeout(function () {
            goBottom("vchatbox");
        }, 800);
    });
    io_game.on('werewolf', function(data) {
        $scope.werewolf_remarks.push(data);
        setTimeout(function () {
            goBottom("wchatbox");
        }, 800);
    });
    // 村民登録関連
    $scope.joinname = getJoinname();
    $scope.joinVillage = function () {
        io_game.json.emit('join', {
            key: getZinrokey(),
            name: $scope.joinname 
        });
        localStorage.setItem("joinname", $scope.joinname);
    };
    // コマンド
    $scope.cmds =  [];
    
    // Chat関連
    $scope.villagertext = "";
    $scope.werewolftext = "";
    $scope.sendVillager = function () {
        if (! $scope.villagertext) {     // 空文字の送信はしない
            return; 
        }
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
    io_game.json.emit('get_user', { key: getZinrokey() });

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

    
    // Style関連
    $scope.style_body = {
        "background-color": "white"
    };
    $scope.style_chatbox = {
        height: getChatboxHeight() + "px"
    };
    var resizeTimer = false;
    window.addEventListener('resize', function (event) {
        if (resizeTimer !== false) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(function () {
            $scope.style_chatbox.height = getChatboxHeight() + "px";
        }, 500);
    });
}]);


zinroApp.controller('VillageCtrl', function($scope, $http) {
    $scope.village = {}     // 初期値は前回の状態を反映
    $scope.initVillage = function() {
        $http.post(
            '/init_village', $scope.village
        ).success(function(data) {
            window.location.href = '/zinro';
        }).error(function(data) {
            console.error("error in posting");
        })
    };
    $scope.destroyVillage = function() {
        $http.post(
            '/destroy_village'
        ).success(function(data) {
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

