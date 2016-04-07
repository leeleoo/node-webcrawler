/// 依赖模块
var fs = require('fs');
var request = require("request");
var cheerio = require("cheerio");
var mkdirp = require('mkdirp');
var iconv = require('iconv-lite');
var async = require('async');
var color = require('./color.js');
var path = require('path');
var URL = require('url');
var pool = require('./server-db');

var config;/// 所选配置文件
var rooturl;
var rootsite;
var hostname;
var log;

/// 监听主进程发送过来的信息
process.on('message', function (m) {
    fs.readFile(path.normalize(__dirname + '/../config/' + m), function (err, data) {
        if (err) {
            console.log(err)
            log('读取配置文件失败', 'red');
            return;
        }
        config = JSON.parse(data);
	      config.headers = {
		      'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.110 Safari/537.36'
	      }
        rooturl = config.isPagination ? function (i) { return config.url.replace('%%', i); }:config.url;
        rootsite = config.url.match(/[^\.]+[^/]+/)[0];
        hostname = URL.parse(rootsite).hostname;
        log('抓取' + rootsite + '中', 'blueBG');
        new Crawler().crawl();
    });
});

var Crawler = function () {
    this.from = config.from || 1;
    this.to = config.to || 1;
};

/// 开始处理的入口
Crawler.prototype.crawl = function () {
    var that = this;
    var urlLevels = []; /// 收集每个层级的url
    that.log('程序正在执行中...');
    
    /// 通过config.selector的长度来确定页面的层线
    async.eachSeries(config.selector, function (item, callback) {
        var index = config.selector.indexOf(item);
        /// 最后一层级
        if (index === config.selector.length - 1) {
            if (config.type) {
	              //if(config.type === 'new'){
		             //  return that[config.type](config.url)
	              //}
                if (that[config.type]) {
                    that[config.type](urlLevels[index - 1]);
                } else {
                    that.log('参数type值无效，参数为text|image', 'redBG');
                }
            } else {
                that.log('您没有配置参数type，参数为text|image', 'redBG');
            }
        } 
                /// 第一层级
        else if (index === 0) {
            urlLevels[0] = [];
            if (config.isPagination) {
                var i = config.from;
                async.whilst(function () {
                    return i <= config.to;
                }, function (_callback) {
                    that.request(rooturl(i), function (status, $) {
                        if (status) {
                            var $$ = eval(item.$);
                            $$.each(function () {
                                var nextUrl = $(this).attr(item.attr);
                                if (!/^http:\/\//i.test(nextUrl)) {
                                    nextUrl = rootsite + nextUrl;
                                }
                                urlLevels[0].push(nextUrl);
                            });
                            that.log('第' + i + '页分析完成');
                        } else {
                            that.log(rooturl(i) + '请求失败', 'red');
                        }
                        setTimeout(function () {
                            ++i;
                            _callback(null);
                        }, parseInt(Math.random() * 2000));
                    });
                }, function (err) {
                    if (err) {
                        that.log(err, 'red');
                    } else {
                        var show_txt = '';
                        if (config.type === 'image') {
                            show_txt = '套图片';
                        } else if (config.type === 'text') {
                            show_txt = '篇文章';
                        }
                        that.log('分页处理完成，共收集到了' + urlLevels[0].length + show_txt, 'green');
                    }
                    callback(null);
                });
            } else {
                that.request(rooturl, function (status, $) {
                    if (status) {
                        eval(item.$).each(function () {
                            urlLevels[0].push($(this).attr(item.attr));
                        });
                    } else {
                        that.log(rooturl + '请求失败', 'red');
                    }
                    callback(null);
                });
            }
        } 
                /// 中间层级
        else {
            urlLevels[index] = [];
            async.eachSeries(urlLevels[index - 1], function (_item, _callback) {
                that.request(_item, function (status, $) {
                    if (status) {
                        eval(_item.$).each(function () {
                            urlLevels[index].push($(this).attr(_item.attr));
                        });
                    } else {
                        that.log(_item + '请求失败', 'red');
                    }
                    _callback(null);
                });
            }, function () {
                callback(null);
            });
        }
    }, function (err) {
        if (err) {
            that.log(err, 'red');
        } else {
            that.log('层级地址完成', 'green');
        }
    });
    
    
};

/// 处理text
/// urls:{Array}
Crawler.prototype.text = function (urls) {
		console.log(urls)
    var that = this;
    that.log('抓取文本中...');
    var i = 0;
    var count = urls.length;
    mkdirp(config.saveDir + '/' + hostname, function (err) {
        if (err) {
            that.log('创建目录失败', 'red');
            process.exit(0);
        } else {
            async.whilst(function () {
                return i < urls.length;
            }, function (callback) {
                var uri = urls[i];
                that.request(uri, function (status, $) {
                    if (status) {
                        var title = that.title($("title").text());
                        var filepath = path.join(config.saveDir, hostname, title + '.txt');
                        var last = config.selector[config.selector.length - 1];
                        var content = eval(last.$).text();
                        fs.writeFile(filepath, content, { flag: 'wx' }, function (_err) {
                            if (_err) {
                                if (_err.code === 'EEXIST') {
                                    that.log('文件' + filepath + '已存在', 'yellow');
                                } else {
                                    that.log('保存文件' + filepath + '失败', 'red');
                                }
                            } else {
                                that.log(i + '/' + count + ' 文件' + filepath + '保存成功', 'green');
                            }
                            setTimeout(callback, parseInt(Math.random() * 2000));
                        });
                    } else {
                        setTimeout(callback, parseInt(Math.random() * 2000));
                    }
                });
                ++i;
            }, function (err) {
                if (err) {
                    that.log(err, "red");
                } else {
                    that.log('执行完毕~', "green");
                }
            });
        }
    });
	
};

Crawler.prototype.new = function (urls) {
	var that = this;
	that.log('抓取文本中...');
	var i = 0;
	var count = urls.length;
	var newList = []
	async.whilst(function () {
		return i < urls.length;
	}, function (callback) {
		var uri = urls[i];
		that.request(uri, function (status, $) {
			if (status) {
				var title = that.title($("title").text());
				//var filepath = path.join(config.saveDir, hostname, title + '.txt');
				var last = config.selector[config.selector.length - 1];
				var content = eval(last.$).text().trim().substr(0,45);
				newList.push({
					title:title,
					addTime:new Date(),
					content:content,
					appNumber:config.appNumber,
					nid:config.category,
					url:config.urlSupplement ? config.urlSupplement+$(this).attr(last.attr) : $(this).attr(last.attr),
				})
				setTimeout(callback, parseInt(Math.random() * 2000));
			} else {
				setTimeout(callback, parseInt(Math.random() * 2000));
			}
		});
		++i;
	}, function (err) {
		if (err) {
			that.log(err, "red");
		} else {
			that.log('爬取完毕.. 正在插入数据库...','green');
			pool.getConnection(function(err, connection) {
				if(err)  {console.log(err); return;}
				var promiseArray = []
				newList.map(function(el){
					var _Promise = new Promise(function(resolve,reject){
						connection.query(`SELECT * from t_new_list where title='${el.title}' and appNumber='${config.appNumber}'`,function(err,rows){
							if(err)  {that.log(`查询${el.content}是否存在报错+${err}`,'red'); reject(err); return;}
							if(rows instanceof Array && rows.length === 0){
								connection.query(`INSERT INTO t_new_list SET ?`,el,function(err,rows){
									if(err)  {that.log(`插入${el.content}时报错,${err}`,'red'); reject(err); return;}
									that.log(`${el.content}插入成功`,'green')
									resolve(rows)
								})
							}else{
								that.log(`${el.content}已经存在`,'yellow')
								resolve(rows)
							}
						})
					})
					promiseArray.push(_Promise)
				})
				Promise.all(promiseArray).then(function(){
						that.log(`程序执行完毕`,'green')
						connection.release()
					}).catch(function(res){
						that.log(`出错,${res}`,'red')
						connection.release()
					})
			});
		}
	});
};
/// 处理image
/// urls:{Array}
Crawler.prototype.image = function (urls) {
    var that = this;
    that.log('抓取图片中...');
    var i = 0;
    var count = urls.length;
    async.whilst(function () {
        return i < count;
    }, function (callback) {
        var uri = urls[i];
        that.request(uri, function (status, $) {
            var list = []; /// 存储图片路径
            if (status) {
                var last = config.selector[config.selector.length - 1];
                var $$ = eval(last.$);
                var len = $$.length;
                if (len > 0) {
                    $$.each(function () {
						var url = $(this).attr(last.attr);
						/// 如果url地址是以//开头则默认补上http: （如果是https协议需自己手动修改）
						if(/^\/\//.test(url)){
							url='http:'+url;
						}
                        list.push({
                            url: url,
                            title: that.title($("title").text())
                        });
                    });
                }
                that.log('第 {0} 套图片收集了{1}张图片'.format((i + 1) + '/' + count, $$.length));
                that.dlImage(list, function () {
                    ++i;
                    callback();
                });
            } else {
                ++i;
                callback();
                that.log('页面' + uri + '请求失败', 'redBG');
            }
        });
    }, function (err) {
        if (err) that.log('imageError:' + err);
        process.exit(0);
    });
};

/// 下载图片
Crawler.prototype.dlImage = function (list, callback) {
    var that = this;
    var count = list.length;
    that.log('准备下载到本地中...');
    if (count < 1) {
        callback();
        return;
    }
    async.eachSeries(list, function (item, callback) {
        var filename = item.url.match(/[^\/]+\.((jpg)|(jpeg)|(png)|(gif)|(bmp))/)[0];
        var filepath = path.join(config.saveDir, item.title);
        mkdirp(filepath, function (err) {
            if (err) {
                callback(err);
            } else {
                request.head(item.url, function (err, res, body) {
                    var fn = eval('(' + config.imageFn + ')');
                    var url = typeof fn === 'function' ? fn(item.url) : item.url;
                    var savePath = path.join(filepath, filename);
                    fs.exists(savePath, function (exists) {
                        if (exists) {
                            that.log(savePath + '已存在', 'yellow');
                            callback();
                        } else {
                            request(url).pipe(fs.createWriteStream(savePath));
                            that.log((list.indexOf(item) + 1) + '/' + count + '：' + path.join(filepath, filename) + '保存成功', 'green');
                            setTimeout(callback, parseInt(Math.random() * 2000));
                        }
                    });
                });
            }
        });
    }, function (err) {
        if (err) {
            that.log(err, "red");
        } else {
            that.log(list[0].title + ' ：下载完毕~', "greenBG");
        }
        callback();
    });
};

/// 获取页面
/// url:{String} 页面地址
/// callback:{Function} 获取页面完成后的回调callback(boolen,$)
Crawler.prototype.request = function (url, callback) {
    var that = this;    
    var opts = {
        url: url,
        encoding: null /// 设置为null时，得到的body为buffer类型
    };
    
    config.headers && (opts.headers = config.headers);
    
    that.log('发送' + url + '，等待响应中...', 'grey');
    request(opts, function (err, res, body) {
        var $ = null;
        if (!err && res.statusCode == 200) {
            that.log('状态' + res.statusCode + '， ' + url + '请求成功', 'green');
	          //console.log(iconv.decode(body,'gb2312'));
            $ = cheerio.load(iconv.decode(body, config.charset || 'utf8'));
        } else {
            !err && that.log('状态' + res.statusCode + '， ' + url + '请求失败', 'red');
        }
        callback(!!$, $);
    });
};

Crawler.prototype.toDB = function(obj,callback){

}
Crawler.prototype.toJSON = function(obj,callback){

}

/// 处理标题(title)
Crawler.prototype.title = function (str) {
    var title = str.replace(/[\\/:\*\?"<>\|\n\r]/g, '').trim();
    if (/-/.test(title)) {
        title = title.match(/(.+)\-[^\-]+$/)[1].trim();
    }
    
    return title;
};

/// 输出信息
Crawler.prototype.log = log = function (info, c) {
    var that = this;
    if (config.mode === 'web') {
        process.send(JSON.stringify({ color: c || '', info: info })); /// 发送数据给主进程
    } else if (config.mode === 'console') {
        console.log(color(c), info);
    }
};

String.prototype.format = function () {
    var formatted = this;
    var length = arguments.length;
    for (var i = 0; i < length; i++) {
        var regexp = new RegExp('\\{' + i + '\\}', 'gi');
        var value = arguments[i];
        if (value === null || value === undefined)
            value = '';
        formatted = formatted.replace(regexp, value);
    }
    return formatted;
};
