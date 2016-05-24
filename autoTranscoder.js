'use strict';
console.log('Loading function');

let aws = require('aws-sdk');
let s3 = new aws.S3({ apiVersion: '2006-03-01' });
let eltr = new aws.ElasticTranscoder();

const outputBucket = "XXXXX-XXXXXX-XXXXX";
const pipelineId = 'XXXXXXXXXX-XXXXXX';
const audioPreset = '1351620000001-300020';
const videoPresets = {
            '240': {preset: '1351620000001-000061'},
            '360': {preset: '1351620000001-000020'},
            '480': {preset: '1351620000001-000040'},
            '720': {preset: '1351620000001-000010'},
};

exports.handler = (event, context, callback) => {
    const inputBucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const params = {
        Bucket: inputBucket,
        Key: key
    };

    s3.getObject(params, (err, data) => {
        if (err) {
            console.log(err);
            const message = `Error getting object ${key} from bucket ${inputBucket}. Make sure they exist and your bucket is in the same region as this function.`;
            console.log(message);
            callback(message);
        } else {
            console.log('Successful Upload');
            console.log('Found media:', data.ContentType);
            console.log(JSON.stringify(data.Metadata));
            
            let date = new Date();
            let etag = data.ETag.replace(/"/g,'');
            let presetModes = Object.keys(videoPresets);
            let dataType =  data.ContentType.substr(0,  data.ContentType.indexOf('/')); 
            
            var path;
            var filename;

            // configure directory path
            if (data.ContentType) {
                path = data.ContentType.charAt(0);
            } else {
                path = "x";
            }
            path += "/" + date.getFullYear() + "/" + ("0" + (date.getMonth() + 1)).slice(-2);
            path += "/" + etag;
            
            getRealPath(path, function(realPath){                 
                // send media files to Elastic Transcoder
                if (dataType == 'video') {
                    presetModes.forEach(function(presetMode) {
                        filename = dataType + "-" + presetMode + ".mp4";
                        console.log("Transcoding video to " +  realPath + '/' + filename);
                        sendtoET(key, videoPresets[presetMode].preset, realPath, filename);
                    });
                } else if (dataType == 'audio') {
                    filename = dataType + ".mp3";
                    console.log("Transcoding audio to " +  realPath + '/' + filename);
                    sendtoET(key, audioPreset, realPath, filename);
                }
                
            });
        }
    });
};

function getRealPath(path, callback) {
    var params = {
      Bucket: outputBucket,
      Prefix: path
    };
    var pathIncrement = 0;
    s3.listObjects(params, function(err, data) {
      if (err) {  
        console.log("Failed to check if path exists");
        console.log(err);
      } else {  
        if (Object.keys(data.Contents).length) {
            if(path.charAt(path.length-5) == '-') {
                // increment suffix
                pathIncrement = parseInt(path.substr(path.length-3,  path.length, 10)) + 1;
                path = path.substr(0, path.length-5) + '-' + ('0000' + pathIncrement).substr(-4); 
                getRealPath(path, callback);
            } else {
                // no initial suffix exists
                getRealPath(path+'-0001', callback);
            }
        } else {
            callback(path);
        }
      }
    });
}

function sendtoET(key, preset, path, filename) {
    console.log('Sending ' + key + ' to ET');
    var params = {
        PipelineId: pipelineId,
        OutputKeyPrefix: path + "/",
        Input: {
            Key: key,
            FrameRate: 'auto',
            Resolution: 'auto',
            AspectRatio: 'auto',
            Interlaced: 'auto',
            Container: 'auto'
        },
        Output: {
            Key: filename,
            PresetId: preset,
            Rotate: 'auto'
        }
    };    
    if (preset != audioPreset) {
        params.Output.ThumbnailPattern = 'thumb-' + filename.substr(0,  filename.indexOf('.')) + '-{count}';
    }    
    eltr.createJob(params, function(err, data) {
        if (err) {
            console.log('Failed to send new video' + key + ' to Elastic Transcode ');
            console.log(err);
            console.log(err.stack);
        } else {
            console.log('Job Created');  
            console.log(data);
        }
    });
}
