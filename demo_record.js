var Recorder = require('./RTSPRecorder');
 
var rec = new Recorder({
    url: 'rtsp://192.168.0.102/media/video1', //url to rtsp stream 
    timeLimit: 20, //length of one video file (seconds) 
    folder: 'videos/', //path to video folder  
    movieWidth: 704, //width of video 
    movieHeight: 576, //height of video 
    maxDirSize: 1024*20, //max size of folder with videos (MB), when size of folder more than limit folder will be cleared 
    maxTryReconnect: 15, //max count for reconnects 
    channel: 1
});
 
//start recording 
rec.initialize();
 
//start stream to websocket, port 8001 
rec.wsStream(8001);