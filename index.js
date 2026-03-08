var express = require('express');
var path = require('path');
var app = express();
var serveIndex = require('serve-index');
var editor = require('./src/editor.js');
var print = require('./src/print.js');
var mock = require('./src/mock');
var bodyParser = require('body-parser');
const mcpServer = require('./src/mcp-server.js');
const aiChat = require('./src/mcp-client/mcp-chat.js');

app.use(bodyParser.json({ extended: true, limit: '200mb' })); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true ,limit: '200mb' } )); // for parsing application/x-www-form-urlencoded
app.use(bodyParser.text({ limit: '200mb' })); // for parsing text/plain

// 日志中间件放在所有路由挂载之前
app.use(function(req, res, next) {
	var url = req.originalUrl;
	if (!/\.(html|js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)(\?|$)/i.test(url)) {
		console.log('[INDEX] 收到请求:', req.method, req.originalUrl);
	}
	next();
});

// 显式挂载 demo 目录：本地/完整部署用 hmEditor/demo，Docker 构建用 editorDist/demo（grunt copy:demo 产出）
var fs = require('fs');
var demoDir = path.join(__dirname, 'hmEditor', 'demo');
if (!fs.existsSync(demoDir)) {
	demoDir = path.join(__dirname, 'editorDist', 'demo');
}
if (fs.existsSync(demoDir)) {
	app.use('/demo', express.static(demoDir, { index: ['index.html'] }));
	app.use('/hmEditor/demo', express.static(demoDir, { index: ['index.html'] }));
}

// 允许跨域请求
// app.all('*', function (req, res, next) {
//     res.header("Access-Control-Allow-Origin", '*');
//     res.header("Access-Control-Allow-Credentials", "true");
//     res.header("Access-Control-Allow-Headers", "*");
//     res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
//     next();
// });

// dot
var dot = require('dot');
var dotPath;
app.set('view engine', 'dot');  // 设置模板引擎
app.set('views', dotPath);
app.engine('dot',async function (path, options, callback) {
    var fn = dot.template(require('fs').readFileSync(path).toString());
    var html = fn(options);
    callback(null, html);
});

// "/" 路径按优先级访问：/hmEditor > /editorDist > /
app.use(express.static(__dirname + '/hmEditor'));
app.use(express.static(__dirname + '/editorDist'));
app.use(express.static(__dirname + '/'));

// "/hmEditor" 路径转发到 "/"，可以访问 /、/editorDist、/hmEditor
app.use('/hmEditor', express.static(__dirname + '/hmEditor'));
app.use('/hmEditor', express.static(__dirname + '/editorDist'));
app.use('/hmEditor', express.static(__dirname + '/'));

app.use('/emr-editor/public', express.static(__dirname + '/public'));

app.use('/emr-editor/album',
	serveIndex(__dirname + '/album',{
		template:"./album_public/directory.html"
	}));

app.use('/emr-editor/mock', mock);
app.use('/emr-editor', editor);
app.use('/emr-print', print);
app.use('/mcp-server', mcpServer.router);
app.use('/ai-chat', aiChat);

var server = app.listen(process.env.PORT||3071,'0.0.0.0',function(){
	var port = process.env.PORT||3071;
	var baseUrl = 'http://127.0.0.1:' + port;
	
	console.log('\n========================================');
	console.log('欢迎使用 惠每智能电子病历编辑器');
	console.log('官网地址：https://editor.huimei.com/');
	console.log('========================================\n');
	
	console.log('📄 Demo 页面地址：');
	console.log('   ' + baseUrl + '/demo/index.html');
	console.log('   ' + baseUrl + '/demo/ai-draft-demo.html');
	console.log('或 ' + baseUrl + '/hmEditor/demo/index.html');
	console.log('   ' + baseUrl + '/hmEditor/demo/ai-draft-demo.html');
	console.log('');
	
	console.log('📦 JS 引用方式：');
	console.log('   <script src="' + baseUrl + '/hmEditor/iframe/HmEditorIfame.js"></script>');
	console.log('');
	
	console.log('🔗 SDK Host 地址：');
	console.log('   ' + baseUrl + '/hmEditor');
	console.log('\n========================================\n');

});

// 注册MCP WebSocket服务
mcpServer.registerMcpWebSocket(server);
