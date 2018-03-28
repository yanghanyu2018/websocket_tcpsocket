// 说明：
// 建立HTTP+WebSocket服务和TCPSocket服务。
// 1) 控制端：主要连接WebSocket，发送命令给服务器，服务器转发到相应的终端。
// 2) 受控客户端：主要连接TCPSocket服务，接收来自服务端的命令，并根据命令执行相应的动作。
// 控制命令是@开头的Jason格式字符串，如：@{cmd:'play',id:'1',type:'video',data:'video01.mp4',area:'1'}
// 非控制命令将不转发或传递。

var version = '1.0.2.5-[2016.10.24]';

var argv = require('optimist')
  .usage('Usage:node ccms.js --wsport [port]  --tsport [port]')
  .demand('wsport').describe('wsport', 'Web+WebSocket服务的连接端口')
  .demand('tsport').describe('tsport', 'TcpSocket服务的连接端口')
  .options('monitor',{default : 'N', describe: '控制是否监控进程'})
  .argv;

var ws_onlineCount = 0; //WebSocket的当前在线人数
var ts_onlineCount = 0; //TcpSocket的当前在线人数
var ws_onlineUsers = {}; //WebSocket的在线用户名称
var ts_onlineUsers = {}; //TcpSocket的在线用户名称

var app = require('express')();

//设置跨域访问
app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    //res.header("Content-Type", "application/json;charset=utf-8");
    next();
});

app.get('/', function (req, res) {
  res.send('<h1>欢迎使用WebSocket和TcpSocket服务</h1>'
     + '<p>控制端：主要连接WebSocket，发送命令给服务器，服务器转发到相应的终端</p>'
     + '<p>WebSocket在线用户数量：' + ws_onlineCount + '<br>用户列表：' + JSON.stringify(ws_onlineUsers) + '</p>'
     + '<p>受控客户端：主要连接TCPSocket服务，接收来自服务端的命令，并根据命令执行相应的动作。</p>'
     + '<p>TcpSocket在线用户数量：' + ts_onlineCount + '<br>用户列表：' + JSON.stringify(ts_onlineUsers) + '</p>');
  res.end();
});

var http = require('http').Server(app);
http.listen(argv.wsport, function () {
  console.log(_S1 + 'WebSocket listening on *:' + argv.wsport  + _E1);
});


var _S1 = '\033[95m', _E1 = '\033[39m'; // 改变显示的颜色
var _S2 = '\033[96m', _E2 = '\033[39m'; // 改变显示的颜色

console.log(_S1 + 'Version:' + version + _E1);

var bMonitor = false;

if (typeof(argv.monitor) != 'undefined' && (argv.monitor == 'y' || argv.monitor =='Y')) {
  bMonitor = true;
}

var io = require('socket.io')(http); // 使用http服务的端口

// WebSocket的处理
io.on('connection', function (wsocket) {
  console.log(_S1 + 'a new user connected to websocket server.' + _E1);
  
  //监听新用户加入
  wsocket.on('user:joined', function (obj) {
    //将新加入用户的唯一标识当作socket的名称，后面退出的时候会用到
    wsocket.userid = obj.userid;
    wsocket.username = obj.username;
    
    //检查在线列表，如果不在里面就加入
    if (!ws_onlineUsers.hasOwnProperty(obj.userid)) {
      ws_onlineUsers[obj.userid] = obj.username;
      ws_onlineCount++; //在线人数+1
    }
    
    console.log(_S1 + obj.username + '[加入]Websocket Server!' + _E1);
  });
  
  //监听用户退出
  wsocket.on('user:exited', function (obj) {
    //将退出的用户从在线列表中删除
    if (ws_onlineUsers.hasOwnProperty(obj.userid)) {
      delete ws_onlineUsers[obj.userid]; //删除
      ws_onlineCount--; //在线人数-1
      
      console.log(_S1 + obj.username + '[退出]WebSocket Server!' + _E1);
    }
  });
  
  //监听用户退出
  wsocket.on('disconnect', function () {
    //将退出的用户从在线列表中删除
    if (ws_onlineUsers.hasOwnProperty(wsocket.userid)) {
      delete ws_onlineUsers[wsocket.userid]; //删除
      ws_onlineCount--; //在线人数-1
      
      console.log(_S1 + wsocket.username + '[退出]WebSocket Server!' + _E1);
    }
  });
  
  //监听用户发布的信息内容
  wsocket.on('message:send', function (obj) {
    console.log(_S1 + '[' + obj.username + ']' + obj.content + _E1);
    
    var d = obj.content.substring(0, 1);
    if (d === '@') { // 需要转发的消息
      TcpSocketServerProcess(obj.username, obj.content);
    } else if (d === '*') { // 特殊消息处理
      io.emit('message:special', obj);
      console.log(_S1 + obj.username + '[特殊]:' + obj.content + _E1);
    } else {
      // 进行广播处理
      io.emit('message:received', obj);
      console.log(_S1 + obj.username + ' [广播]：' + obj.content + _E1);
    }
  });
  
  //错误处理
  wsocket.on('error', function (obj) {
    console.log(_S1 + '[' + obj.username + '] error!' + _E1);
    if (ws_onlineUsers.hasOwnProperty(wsocket.userid)) {
      //删除
      delete ws_onlineUsers[wsocket.userid];
      ws_onlineCount--; //在线人数-1
    }
    console.log(_S1 + wsocket.username + ' [出错]!' + _E1);
  });
  
  wsocket.emit('user:connected', 'success'); // 发送连接成功命令
});


// TCP Socket 服务器
var net = require('net');

// TCP服务处理
var server = net.createServer(function (conn) {
    var nickname = null;
    
    conn.setEncoding('utf8'); // 设置服务器为utf8
    
    conn.write('whoAreYou\r\n');
    conn.setKeepAlive(true, 30000);
    
    conn.on('close', function () {
      console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '] has disconnected with TcpSocket Server' + _E2);
      delete ts_onlineUsers[nickname];
    });
    
    conn.on('error', function () {
      console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '] error' + _E2);
      delete ts_onlineUsers[nickname];
    });
    
    conn.on('data', function (data) {
      data = data.replace('\r\n', '').trim();           
      if (data.length == 0)
        return;
        
        
      console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + nickname + ']' + data + _E2);
      data = data.replace('###', '').replace('&&&', '').trim();  
      if (data.length == 0)
        return;
                          
      if (data.substring(0, 1) === '@') { // 转发到TcpServer
        TcpSocketServerProcess(nickname, data);
        return;
      }
      if (data.substring(0, 1) === '#') { // 转发到WebSocket Server进行发送
        WebSocketSendAll(nickname, data);
        return;
      }
      
      if (data.trim().toLowerCase() === 'hello') {
        conn.write('hello');
        return;
      }
      
      if (data.trim().toLowerCase() === 'exit') {
        conn.write('exit');
        console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + nickname + '] exit' + _E2);
        return conn.end();
      }
      
      if (!nickname) { //假如没有注册
        if (data.substring(0, 2) != 'id') { // 以idXXXXX开头的被认为是名称。
          nickname = null;
          conn.write(data + ' is not a valid name!\r\n');
          console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + data + '] is not a valid name' + _E2);
          return;
        }
        data = data.replace('\r', '').replace('\n', '').replace(' ', '_');
        if (ts_onlineUsers[data]) {
          conn.write('Already exist this name. Please re-input agian:\r\n');
          console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + data + '] already exist!' + _E2);
        } else {
          ts_onlineCount++;
          
          nickname = data;
          ts_onlineUsers[nickname] = conn;
          //conn.write('A valid name [' + nickname + ']\r\n');
          console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + nickname + '] is a valid name!' + _E2);
          
          for (var i in ts_onlineUsers) {
            if (i === nickname) {
              console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + nickname + '] can receive data in TcpSocket[connIsReady]!!!' + _E2);
              ts_onlineUsers[i].write('connIsReady\r\n');
            } else {
              // ts_onlineUsers[i].write('[' + nickname + '] join TcpSocket Server' + '\r\n');
              // console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '][' + nickname + '] join TcpSocket Server!!!' + _E2);
            };
          };
        }
      } else {
        // 进行其它的处理
        // TODO: 待增加
      }
    });
    
    console.log(_S2 + '[' + conn.remoteAddress + ':' + conn.remotePort + '] has connected to TcpSocket Server' + _E2);
  });

// 发消息送给除nickname以外的TCP连接用户
function _msg_others(nickname, data) {
  for (var i in ts_onlineUsers) {
    if (i != nickname) {
      ts_onlineUsers[i].write('[' + nickname + ']: ' + data + '\r\n');
    };
  };
  console.log(_S2 + '[' + nickname + ']: ' + data + _E2);
};

// 给指定的TCP连接用户发送信息
function _msg_to_person(nickname, data, b) {
  for (var i in ts_onlineUsers) {
    if (i == nickname) {
      ts_onlineUsers[i].write(data + '\r\n');
    };
  };
  if (typeof(b) == 'undefined' || b == true)
    console.log(_S2 + '[' + nickname + ']: ' + data + _E2);
};

// 发送消息给所有的TCP连接用户
function TcpSocketSendAll(fromWho, data) {
  for (var i in ts_onlineUsers) {
    ts_onlineUsers[i].write(data);
  };
}

// TCP Server的链接处理
// 发给Socket连接的命令需要转换为简单格式，例如：play id,url  或 playat id,url,pos
function TcpSocketServerProcess(user, data) {
  var cmdObj = strToJson(data.substring(1, data.length));
  if (!cmdObj)
    return;
  
  switch (cmdObj.cmd) {
  case 'playat':
    // 需要特殊处理pos信息
    cmdObj.data = cmdObj.data + ',' + cmdObj.pos;
  case 'play':
    if (cmdObj.area) {
      var i = 1,
      ar = parseInt(cmdObj.area);
      while (ar > 0) {
        if (ar % 2) {
          if (cmdObj.type === 'tv' || cmdObj.type === 'audio' || cmdObj.type === 'video' || cmdObj.type === 'paging' || cmdObj.type == 'all') {
            _msg_to_person('idPlay0' + i, cmdObj.cmd + ' ' + cmdObj.id + ',' + decodeURIComponent(cmdObj.data));
          }
          if (cmdObj.type === 'text' || cmdObj.type == 'all') {
            _msg_to_person('idSubtitle0' + i, cmdObj.cmd + ' ' + cmdObj.id + ',' + decodeURIComponent(cmdObj.data));
          }
          if (cmdObj.type === 'airshow' || cmdObj.type == 'all') {
            _msg_to_person('idAirmap0' + i, cmdObj.cmd + ' ' + cmdObj.id + ',' + decodeURIComponent(cmdObj.data));
          }
        }
        i++;
        ar = Math.floor(ar / 2);
      }
    }
    break;
  case 'resume':
  case 'cont':
  case 'pause':
    if (cmdObj.area) {
      var i = 1,
      ar = parseInt(cmdObj.area);
      while (ar > 0) {
        if (ar % 2) {
          if (cmdObj.type === 'tv' || cmdObj.type === 'audio' || cmdObj.type === 'video' || cmdObj.type === 'paging' || cmdObj.type == 'all') {
            _msg_to_person('idPlay0' + i, cmdObj.cmd);
          }
          if (cmdObj.type === 'airshow' || cmdObj.type == 'all') {
            _msg_to_person('idAirmap0' + i, cmdObj.cmd);
          }
          if (cmdObj.type === 'text' || cmdObj.type == 'all') {
            _msg_to_person('idSubtitle0' + i, cmdObj.cmd);
          }
        }
        i++;
        ar = Math.floor(ar / 2);
      }
    }
    break;
  case 'volume#':
    cmdObj.cmd = 'volume' + cmdObj.data;
  case 'volume+':
  case 'volume-':
  case 'speak':
  case 'pts': // 获取当前位置
  case 'mute':
  case 'stop':
  case 'state':
  case 'exit':
    if (cmdObj.area) {
      var i = 1,
      ar = parseInt(cmdObj.area);
      while (ar > 0) {
        if (ar % 2) {
          _msg_to_person('idPlay0' + i, cmdObj.cmd);
          _msg_to_person('idAirMap0' + i, cmdObj.cmd);
          _msg_to_person('idSubtitle0' + i, cmdObj.cmd);
        }
        i++;
        ar = Math.floor(ar / 2);
      }
    }
    break;
  default:
    _msg_to_person('idAPAS01', '@' + Json2str(cmdObj));
    break;
  }
}

// 发送信息给所有Websocket方式连接的用户
function WebSocketSendAll(fromWho, status) {
  var obj = {};
  try {
    obj = strToJson(status.substring(1));
    obj.area = obj.area.replace('idPlay0', '');
  } catch (e) {
    console.log(_S1 + '转发来自:[' + fromWho + ']的数据[' + status.substring(1) + ']出现错误！' + _E1);
    return;
  }
  
  console.log(_S1 + '转发来自:[' + fromWho + ']的数据[' + Json2str(obj) + ']' + _E1);
  io.emit('message:status', Json2str(obj));
}

function strToJson(str) {
  var json = eval('(' + str + ')');
  return json;
}

function Json2str(o) {
  var arr = [];
  var fmt = function (s) {
    if (typeof(s) == 'object' && s != null)
      return json2str(s);
    return /^(string|number)$/.test(typeof s) ? '"' + s + '"' : s;
  }
  for (var i in o)
    arr.push('"' + i + '":' + fmt(o[i]));
  return '{' + arr.join(',') + '}';
}

server.on('close', function () {
  console.log(_S2 + "TcpSocket Server is now closed" + _E2);
  server.removeAllListeners('close');
});

// 服务器错误事件
server.on('error', function (exception) {
  console.log(_S2 + "tcpsocket server error:" + exception + _E2);
});

server.listen(argv.tsport, function () {
  console.log(_S2 + 'TcpSocket Server listening on *:' + argv.tsport + _E2);
});

// 定时执行任务
var schedule = require("node-schedule");
var rule = new schedule.RecurrenceRule();
var times = [];

// 每3秒钟执行一次任务
for (var i = 1; i < 60; i += 3) {
  times.push(i);
}
rule.second = times;

schedule.scheduleJob(rule, function () {
  // 发送状态询问消息state
  var i = 1,
  ar = 3;
  while (ar > 0) {
    if (ar % 2) {
      _msg_to_person('idPlay0' + i, 'state', false);
      _msg_to_person('idAirmap0' + i, 'state', false);
      //_msg_to_person('idSubtitle0' + i, 'state', false);
    }
    i++;
    ar = Math.floor(ar / 2);
  }
  
  checkProcess();
});


console.log(_S1 + '每隔3秒钟询问一次状态...' + _E1);

// 启动Linux进程
var child_process = require("child_process");
function checkProcess() {
 if (bMonitor) {
  child_process.exec('/usr/share/airshow/websocket/checkProcess.sh "AirPlay_01" "/usr/share/airshow/airplay1/apl"', function(err, stdout, stderr) {
  	if (stdout.length > 0)
      console.log(stdout);
    if (stderr.length > 0)
      console.log(stderr);
    });
  child_process.exec('/usr/share/airshow/websocket/checkProcess.sh "AirPlay_02" "/usr/share/airshow/airplay2/apl"', function(err, stdout, stderr) {
  	if (stdout.length > 0)
      console.log(stdout);
    if (stderr.length > 0)
      console.log(stderr);
    });
 } 
}


