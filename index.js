/**
 * @author    Jack Yang
 * @copyright Copyright (c) 2016
 *
 * ccms后台服务程序: 
 * 1）提供一个http服务
 * 2）提供一个tcp socket服务
 * 3）提供一个websocket服务
 * 说明：
 * 1) 控制端：主要连接WebSocket，发送命令给服务器，服务器转发到相应的终端。
 * 2) 受控客户端：主要连接TCPSocket服务，接收来自服务端的命令，并根据命令执行相应的动作。
 * 3) 控制命令是@开头的Jason格式字符串，如：@{cmd:'play',id:'1',type:'video',data:'video01.mp4',area:'1'}
 * 4) 非控制命令将不转发或传递。
 */

'use strict';

var version = '2.0.0.0-[2016.11.2]';

var argv = require('optimist')
  .usage('Usage:node ccms.js --wsport [port]  --tsport [port]')
  .demand('wsport').describe('wsport', 'WebSocket服务的连接端口')
  .demand('tsport').describe('tsport', 'TcpSocket服务的连接端口')
  .options('http',{default : '80', describe: 'Web服务的连接端口'})
  .options('monitor',{default : 'N', describe: '控制是否监控进程'})
  .argv;

/**
 * Module dependencies.
 */
var colors  = require('colors');
var logger  = require('mm-node-logger')(module);
var express = require('./src/config/express');
var mongodb = require('./src/config/mongoose');

// Initialize mongoose
mongodb(function startServer() {
    // Initialize express
    var app = express.init();

    // Start up the server on the port specified in the config after we connected to mongodb
    app.listen(config.server.port, function () {
        var serverBanner = ['',
            '*************************************' + ' EXPRESS SERVER '.yellow + '********************************************',
            '*',
            '*' + ' App started on port: '.blue + config.server.port + ' - with environment: '.blue + config.environment.blue,
            '*',
            '*************************************************************************************************',
            ''].join('\n');
        logger.info(serverBanner);
    });

    module.exports = app;
});

