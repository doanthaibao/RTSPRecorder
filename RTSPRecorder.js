/**
 * Created by Shoom on 02.12.15.
 */

(function() {
    var
        fs = require('fs'),
        util = require('util'),
        events = require('events'),
        child_process = require('child_process'),
        du = require('du'),
        async = require('async'),
        ws = require('ws'),
        path = require('path');
    const os = require('os');
    const spawn = require('child_process').spawn;
    var datetime = require('node-datetime');
    var schedule = require('node-schedule');

    //For websocket stream
    var STREAM_MAGIC_BYTES = 'jsmp';
    var META_DATA_FILE = "metadata";
    var DEFAULT_METADATA_CONTENT = {
        "begin": "2017/05/02 00:00:00",
        "end": "2017/05/02 00:00:00",
        "data": []
    };

    /**
     * Date to string
     * @param date {Date|undefined}
     * @returns {string}
     */
    function dateString(date) {
        var dt = date || (new Date());
        return [dt.getDate(), dt.getMonth(), dt.getFullYear()].join('-') + ' ' + [dt.getHours(), dt.getMinutes(), dt.getSeconds()].join('-');
    }

    /**
     * Remove folder recursive
     * @param location {string} dir location
     * @param next {function} callback
     */
    function removeFolder(location, next) {
        fs.readdir(location, function(err, files) {
            async.each(files, function(file, cb) {
                file = location + '/' + file;
                fs.stat(file, function(err, stat) {
                    if (err) {
                        return cb(err);
                    }
                    if (stat.isDirectory()) {
                        removeFolder(file, cb);
                    } else {
                        fs.unlink(file, function(err) {
                            if (err) {
                                return cb(err);
                            }
                            return cb();
                        });
                    }
                });
            }, function(err) {
                if (err) {
                    return next(err);
                }
                fs.rmdir(location, function(err) {
                    return next(err);
                });
            });
        });
    }

    /**
     * Rtsp stream recorder and streamer
     * @param params {object} parameters
     * @constructor
     */
    var Recorder = function(params) {
        //url to stream
        this.url = '';
        //stream for frite video to file
        this.writeStream = null;
        //read stream is started
        this._readStarted = false;
        //count of max reconnect tryes
        this.maxTryReconnect = 5;
        //max size of video directory (MB), if size more than this size dir will be cleared
        this.maxDirSize = 100;
        //width of movie clip
        this.movieWidth = 0;
        //height of movie clip
        this.movieHeight = 0;
        //limit to record one video file
        this.timeLimit = 60 * 10;

        this.channel = 1;

        this.body = null;

        params = params || {};
        for (var v in params) {
            if (params.hasOwnProperty(v)) {
                this[v] = params[v];
            }
        }

        var self = this;

        this.writeMetadataFile = function(beginTime, bEndPeriod, callback) {
            var metaDataFilePath = this.folder + META_DATA_FILE + "_" + beginTime.substring(0, 10) + "_" + this.channel + ".json";

            fs.exists(metaDataFilePath, function(exists) {
                if (exists) {
                    self.updateMetadatFile(metaDataFilePath, beginTime, bEndPeriod, callback);
                } else {
                    var oData = DEFAULT_METADATA_CONTENT;
                    oData.data = [];
                    oData.begin = beginTime;
                    oData.end = beginTime;

                    var item = {
                        "name": self.folder + beginTime + "_" + self.channel + ".mkv",
                        "begin": beginTime,
                        "end": beginTime
                    };
                    oData.data.push(item);
                    fs.appendFile(metaDataFilePath, JSON.stringify(oData), (err) => {
                        if (err) {
                            throw err;
                        }
                        if (callback) {
                            callback();
                        }
                        console.log("Created metadata file!");
                    });
                }
            });


        };
        this.updateMetadatFile = function(__metaDataFilePath, time, bEndPeriod, callback) {
            var oData;
            fs.readFile(__metaDataFilePath, 'utf8', function(err, fileData) {
                // console.log("File Data: " + fileData);
                try {
                    oData = JSON.parse(fileData);
                } catch (e) {
                    console.log("  fs.readFile: Error at " + __metaDataFilePath);
                    console.log(e.toString());
                    return;
                }
                if (!bEndPeriod) {
                    var item = {
                        "name": self.folder + time + "_" + self.channel + ".mkv",
                        "begin": time,
                        "end": time
                    };
                    oData.data.push(item);

                } else {
                    oData.data[oData.data.length - 1].end = time; //update last time
                    oData.end = time;
                }
                fs.writeFile(__metaDataFilePath, JSON.stringify(oData), () => {
                    if (err) {
                        console.log("update data to file failed");
                    }
                    console.log('Update data to file successfully!');
                    if (callback) {
                        callback();
                    }
                });
            });
        };
        /**
         * Connect to rtsp stream with ffmpeg and start record
         */
        this.connect = function() {
            // var fontOption = "";
            // if (os.type() === "Windows_NT") {
            //     fontOption = "drawtext=fontfile=/Windows/Fonts/Arial.ttf: text='%{localtime}': x=(w-tw)/2: y=100: fontcolor=white: box=1: boxcolor=0x00000000@1: fontsize=30";
            // } else {
            //     fontOption = "drawtext=fontfile=/usr/share/fonts/truetype/droid/DroidSans.ttf: text='%{localtime}': x=(w-tw)/2: y=100: fontcolor=white: box=1: boxcolor=0x00000000@1: fontsize=30";
            // }
            // //"-vf", fontOption,
            // //"-rtsp_transport", "tcp",
            // this.readStream = child_process.spawn("ffmpeg", ["-i", this.url, '-c:v', 'libx264', "-f", "matroska", "-"], {
            //     detached: false
            // });
            // this.readStream.stdout.on('data', function(chunk) {
            //     console.log("received data chunk");
            //     if (!self._readStarted) {
            //         self._readStarted = true;
            //         self.emit('readStart');
            //     } else if(self.writeStream) {
            //         self.writeStream.write(chunk);
            //     }
            // });


            // this.readStream.stderr.on('data', function(data) {
            //     console.log("error when read stream: " + data);
            // });

            // this.readStream.stdout.on('close', function() {
            //     self._readStarted = false;
            //     self.reconnect();
            // });

            // return this;
            self.emit('readStart');
        };

        /**
         * Try reconnect to video stream
         * @see connect
         */
        this.reconnect = function() {
            if (this.maxTryReconnect > 0) {
                console.log('Try connect to ' + this.url);
                this.maxTryReconnect--;
                try {
                    this.connect();
                } catch (e) {
                    console.log(e);
                }
            } else {
                this.emit('lostConnection');
                console.log('Connection lost \r\n');
            }

            return this;
        };

        /**
         * Record stream to file
         */
        this.recordStream = function(beginTime) {
            //check folder exising or not
            if (!fs.existsSync(this.folder)) {
                fs.mkdirSync(this.folder);
                console.log("Created folder: " + this.folder + " successfully.");
            }
            this.clearDir(function() {
                var currentTime = datetime.create();
                var beginTime = currentTime.format('m-d-Y H-M-S');
                self.writeMetadataFile(beginTime);
                var filename = this.folder + beginTime + "_" + this.channel + ".mkv";
                this.writeStream = spawn('ffmpeg', ['-i', this.url, '-c:v', 'libx264', "-preset", "slow", "-crf", "22", filename]);

                this.writeStream.on('close', function() {
                    var currentTime = datetime.create();
                    var endTime = currentTime.format('m-d-Y H-M-S');
                    self.writeMetadataFile(endTime, true, function() {
                        self.recordStream(); //start record new file
                    });
                });

                setTimeout(function() {
                    //raise event finish
                    self.writeStream.kill();
                }, this.timeLimit * 1000);

                console.log("Start record " + filename + "\r\n");
            });

            return this;
        };

        /**
         * Clear movies directory
         * @param cb {function} callback
         */
        this.clearDir = function(cb) {
            du(this.folder, function(err, size) {
                if (size / 1024 / 1024 > self.maxDirSize) {
                    try {
                        removeFolder(self.folder, function() {
                            fs.mkdir(self.folder, function() {
                                cb.apply(self);
                            });
                        });
                    } catch (err) {
                        console.log(err);
                    }
                } else {
                    cb.apply(self);
                }
            });

            return this;
        };

        /**
         * Initialize record
         * @see reconnect
         * @see recordStream
         */
        this.initialize = function() {
            this.on('readStart', function() {
                self.maxTryReconnect = 5;
                self.recordStream();
                //Split new metadate when go to new day
                // schedule.scheduleJob({
                //     hour: 0,
                //     minute: 0,
                //     second: 0
                // }, function() {
                //     console.log("New day comes");
                //     var currentTime = datetime.create();
                //     var endTime = currentTime.format('m-d-Y H-M-S');
                //     self.writeStream.end();
                // });
            });
            this.reconnect();
            return this;
        };
    };

    util.inherits(Recorder, events.EventEmitter);

    module.exports = Recorder;
})();
//Connect => emit event 'readStart' => Record stream