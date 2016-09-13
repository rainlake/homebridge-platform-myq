var request = require("request");
var moment = require('moment');
var util = require('util');
var Service, Characteristic, LastUpdate;

'use strict';

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-platform-myq", "MyQ", MyQPlatform);

    LastUpdate = function() {
        var self = this;

        Characteristic.call(self, 'Last Activity', '2837B590-D1BA-11E5-A837-0800200C9A66');

        self.setProps({
            format: Characteristic.Formats.STRING,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });

        self.value = self.getDefaultValue();
    };
    require('util').inherits(LastUpdate, Characteristic);
}
function MyQPlatform(log, config) {
    var self = this;
    self.config = config;
    self.log = log;
    if(config.brand !== 'Craftsman') {
        self.host = 'https://myqexternal.myqdevice.com';
        self.appId = 'NWknvuBd7LoFHfXmKNMBcgajXtZEgKUh4V7WNzMidrpUUluDpVYVZx+xT4PCM5Kx';
    } else {
        self.host = 'https://craftexternal.myqdevice.com';
        self.appId = 'OA9I/hgmPHFp9RYKJqCKfwnhh28uqLJzZ9KOJf1DXoo8N2XAaVX6A1wcLYyWsnnv';
    }
    self.refreshInterval = 30 * 1000;
    self.userAgent = config.brand + '/3.4 (iPhone; iOS 9.2.1; Scale/2.00)';
}
MyQPlatform.prototype.login = function(onSuccess, onFail) {
    var self = this;
    request.post({
        url : self.host + '/api/v4/User/Validate',
        headers: {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId/*,
            'BrandId': self.brandId*/
        },
        json: {
            username: self.config['user'],
            password : self.config['pass']
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            if (body.ReturnCode !== '0') {
                if(onFail) {
                    onFail.call(self, body.ReturnCode, body.ErrorMessage);
                } else {
                    self.retry_login.call(self, onSuccess);
                }
            } else if(onSuccess) {
                self.SecurityToken = body.SecurityToken;
                self.log.debug('SecurityToken: [%s]', self.SecurityToken);
                self.getuser.call(self, onSuccess, function(returnCode, errorMessage) {
                    if(onFail) {
                        onFail.call(self, returnCode, errorMessage);
                    } else {
                        self.retry_login.call(self, onSuccess);
                    }
                }.bind(self));
            }
        }
        else {
            self.log.error('[%s]: Error while login', moment().format('YYYYMMDDHHmmss.SSS'));
            self.log.error(error);
            self.log.error(response);
            self.log.error(body)
            if(!body) {
                body = {};
            }
            if(onFail) {
                onFail.call(self, body.ReturnCode, body.ErrorMessage);
            } else {
                self.retry_login.call(self, onSuccess);
            }
        }
    });
}
MyQPlatform.prototype.retry_login = function(onSuccess) {
    var self = this;
    self.log.warn('[%s]:retrying login.', moment().format('YYYYMMDDHHmmss.SSS'));
    
    self.login(onSuccess, function(returnCode, errorMessage) {
        setTimeout(function() {
            self.retry_login.call(self, onSuccess);
        }.bind(self), self.refreshInterval);
    });
}
MyQPlatform.prototype.getuser = function(onSuccess, onFail) {
    var self = this;
    request.get({
        url : self.host + '/api/v4/user/getuser',
        headers: {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'SecurityToken': self.SecurityToken
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.ReturnCode === '0') {
                self.BrandId = json.BrandId;
                self.BrandName = json.BrandName;
                self.log.debug('BrandId:[%s]', self.BrandId);
                self.log.debug('BrandName:[%s]', self.BrandName);
                if(onSuccess) {
                    onSuccess.call(self);
                }
            } else {
                if(onFail) {
                    onFail(json.ReturnCode, json.ErrorMessage);
                }
            }
        } else {
            self.log.error('[%s]: error while get user', moment().format('YYYYMMDDHHmmss.SSS'));
            self.log.error(error);
            self.log.error(response);
            self.log.error(body)
            if(!body) {
                body = {};
            }
            if(onFail) {
                onFail.call(self, body.ReturnCode, body.ErrorMessage);
            }
        }
    });
}

MyQPlatform.prototype.getDevices = function(onSuccess, onFail) {
    var self = this;
    self.log.debug('[%s]: retrieving devices', moment().format('YYYYMMDDHHmmss.SSS'));
    if(!self.SecurityToken && onFail) {
        onFail.call(self);
        return;
    }
    request.get({
        url : self.host + '/api/v4/userdevicedetails/get',
        headers : {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'BrandId': self.BrandId,
            'SecurityToken': self.SecurityToken,
            'Culture': 'en'
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if(json.ReturnCode === '0') {
                if(json.Devices && json.Devices.length > 0) {
                    var door_devices = [];
                    var light_devices = [];
                    var gateway_devices = [];
                    json.Devices.forEach(function(device) {
                        if(device.MyQDeviceTypeId === 2 /*garage door*/
                            || device.MyQDeviceTypeId === 5 /*gate*/
                            || device.MyQDeviceTypeId === 7 /*MyQGarage(no gateway)*/
                            || device.MyQDeviceTypeId === 17 /*Garage Door Opener WGDO*/) {
                            door_devices.push(device);
                        } else if (device.MyQDeviceTypeId === 3 /*light controller*/) {
                            light_devices.push(device);
                        } else if (device.MyQDeviceTypeId === 1 /*gateway*/) {
                            gateway_devices.push(device);
                        }
                    })
                    onSuccess.call(self, door_devices, light_devices, gateway_devices);
                }
            } else if(onFail) {
                onFail.call(self, error, response);
            } else {
                self.retry_login(onSuccess);
            }
        } else if(onFail) {
            onFail.call(self, error, response);
        } else {
            self.retry_login(onSuccess);
        }
    });
}

MyQPlatform.prototype.getDeviceAttribute = function(deviceid, attributename, onSuccess, onFail) {
    var self = this;
    if(!self.SecurityToken) {
        self.log.error('[%s]: retrieving device attribute [%s] [%s] failed, no SecurityToken', moment().format('YYYYMMDDHHmmss.SSS'), deviceid, attributename);
        if(onFail) {
            onFail.call(self);
        }
        return;
    }
    request.get({
        url : self.host + '/api/v4/deviceattribute/getdeviceattribute',
        qs : {
            'myQDeviceId': deviceid,
            'attributeName': attributename
        },
        headers : {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'BrandId': self.BrandId,
            'SecurityToken': self.SecurityToken,
            'Culture': 'en'
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if(json.ReturnCode === '0') {
                self.log.debug('[%s] get device attribute finished. id[%s], attributename[%s], value[%s], updatetime[%s]',
                moment().format('YYYYMMDDHHmmss.SSS'), deviceid, attributename, json.AttributeValue, json.UpdatedTime);
                onSuccess(json.AttributeValue, json.UpdatedTime);
            } else {
                self.log.error('[%s]:retrieving device attribute [%s] [%s] failed, response body is [%s]', moment().format('YYYYMMDDHHmmss.SSS'), deviceid, attributename, body);
                if(onFail) {
                    onFail(error, response);
                }
                else {
                    self.retry_login(onSuccess);
                }
            }
        } else {
            self.log.error('[%s]: retrieving device attribute [%s] [%s] failed, error is [%s], response is [%s]', moment().format('YYYYMMDDHHmmss.SSS'), deviceid, attributename, error, response);
            if(onFail) {
                onFail(error, response);
            } else {
                self.retry_login(onSuccess);
            }
        }
    });
}

MyQPlatform.prototype.sendCommand = function(command, device_id, state, callback) {
    var self = this;
    request.put({
        url : self.host + '/api/v4/DeviceAttribute/PutDeviceAttribute',
        headers : {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'BrandId': self.BrandId,
            'SecurityToken': self.SecurityToken
        },
        json : {
            MyQDeviceId : device_id,
            AttributeName : command,
            AttributeValue: state,
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200 && body.ReturnCode === '0') {
            self.log.info('[%s]: sendcommand successed, command=[%s],state=[%s]', moment().format('YYYYMMDDHHmmss.SSS'), command, state);
            callback(body);
        } else {
            self.log.error('[%s]: send command failed.', moment().format('YYYYMMDDHHmmss.SSS'));
            self.log.error(error);
            self.log.error(response);
            self.log.error(body);
        }
    });
}
MyQPlatform.prototype.door_open = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desireddoorstate', device_id, '1', callback);
}
MyQPlatform.prototype.door_close = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desireddoorstate', device_id, '0', callback);
}
MyQPlatform.prototype.light_on = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desiredlightstate', device_id, '1', callback);
}
MyQPlatform.prototype.light_off = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desiredlightstate', device_id, '0', callback);
}

MyQPlatform.prototype.accessories = function(callback) {
    var self = this;
    self.login.call(self, function() {
        self.getDevices.call(self, function(door_devices, light_devices, gateway_devices) {
            self.foundAccessories = [];
            door_devices.forEach(function(device) {
                self.foundAccessories.push(new MyQDoorAccessory(self, device));
            });
            light_devices.forEach(function(device) {
                self.foundAccessories.push(new MyQLightAccessory(self, device));
            });
            // gateway_devices.forEach(function(device) {
            //     self.foundAccessories.push(new MyQGateWayAccessory(self, device));
            //});
            callback(self.foundAccessories);
            self.timer = setTimeout(self.deviceStateTimer.bind(self), self.refreshInterval);
        }, function(returnCode, errorMessage) {
            self.log.error('[%s]:MyQ Server error when list accessories, returncode=[%s], errormessage=[%s]', moment().format('YYYYMMDDHHmmss.SSS'), returnCode, errorMessage);
            throw new Error("homebridge-platform-myq has intentially brought down HomeBridge - please restart!");
        });
    }, function(returnCode, errorMessage) {
        self.log.error('[%s]:MyQ Server error, returncode=[%s], errormessage=[%s]', moment().format('YYYYMMDDHHmmss.SSS'), returnCode, errorMessage);
        throw new Error("homebridge-platform-myq has intentially brought down HomeBridge - please fix your configuration!");
    });
}
MyQPlatform.prototype.deviceStateTimer = function() {
    var self = this;
    if(self.timer) {
        clearTimeout(self.timer);
        self.timer = null;
    }
    self.getDevices(function(door_devices, light_devices, gateway_devices) {
        self.foundAccessories.forEach(function(accessory) {
            accessory.updateDevice(door_devices);
            accessory.updateDevice(light_devices);
            accessory.updateDevice(gateway_devices);
        });
        self.timer = setTimeout(self.deviceStateTimer.bind(self), self.refreshInterval);
    });
}

MyQPlatform.prototype.dateTimeToDisplay = function(unixtime) {
    return moment(unixtime, 'x').fromNow()
}

function MyQAccessory(platform, device) {
    var self = this;
    platform.log.debug(device);
    self.init.call(self, platform, device)
}
MyQAccessory.prototype.init = function(platform, device) {
    var self = this;

    self.platform = platform;
    self.log = platform.log;
    self.currentState = '';
    self.name = device.SerialNumber;
    self.updateDevice([device]);
}

MyQAccessory.prototype.descState = function(state) {
    switch(state) {
        case Characteristic.CurrentDoorState.OPEN:
        return 'Open';
        case Characteristic.CurrentDoorState.CLOSED:
        return 'Closed';
        case Characteristic.CurrentDoorState.STOPPED:
        return 'Stopped';
        case Characteristic.CurrentDoorState.OPENING:
        return 'Opening';
        case Characteristic.CurrentDoorState.CLOSING:
        return 'Closing';
        default:
        return state;
    }
}

MyQAccessory.prototype.updateDevice = function(devices) {
    var self = this;
    var isMe = false;
    if(!devices) {
        return false;
    }
    for(var i=0; i< devices.length; i++){
        if(!self.device || self.device.MyQDeviceId === devices[i].MyQDeviceId) {
            self.device = devices[i];
            isMe = true;
            break;
        }
    }
    if(!isMe || !self.device) {
        return false;
    }
    self.device.Attributes.forEach(function(attribute) {
        if (attribute.AttributeDisplayName === 'doorstate') {
            self.doorstate = attribute.Value;
            self.doorstateUpdateTime = attribute.UpdatedTime;
        } else if (attribute.AttributeDisplayName === 'lightstate') {
            self.lightstate = attribute.Value;
            self.lightstateUpdateTime = attribute.UpdatedTime;
        } else if(attribute.AttributeDisplayName === 'desc') {
            if(attribute.Value) {
                self.name = attribute.Value;
            }
        } else if(attribute.AttributeDisplayName === 'isunattendedopenallowed') {
            self.isunattendedopenallowed = attribute.Value === '1';
        } else if(attribute.AttributeDisplayName === 'isunattendedcloseallowed') {
            self.isunattendedcloseallowed = attribute.Value === '1';
        } else if(attribute.AttributeDisplayName === 'fwver') {
            self.fwver = attribute.Value;
        }
    });
    return true;
}

MyQAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
        .setCharacteristic(Characteristic.Manufacturer, self.platform.BrandName)
        .setCharacteristic(Characteristic.Model, self.platform.BrandName)
        .setCharacteristic(Characteristic.SerialNumber, self.device.SerialNumber || '')
        .setCharacteristic(Characteristic.FirmwareRevision, self.fwver || '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, self.hwver || '1.0.0');
    services.push(service);
    if(self.service) {
        services.push(self.service);
    }
    return services;
}

function MyQGateWayAccessory(platform, device) {
    MyQAccessory.call(this, platform, device);
    var self = this;
    self.log.info('[%s]: found Gateway Device, deviceid=%s', moment().format('YYYYMMDDHHmmss.SSS'), self.device.MyQDeviceId);
}

util.inherits(MyQGateWayAccessory, MyQAccessory);

MyQGateWayAccessory.prototype.init = function(platform, device) {
    var self = this;
    MyQGateWayAccessory.super_.prototype.init.call(self, platform, device);
}

MyQGateWayAccessory.prototype.updateDevice = function(devices) {
    var self = this;
    MyQGateWayAccessory.super_.prototype.updateDevice.call(self, devices);
}

function MyQLightAccessory(platform, device) {
    MyQAccessory.call(this, platform, device);
    var self = this;
    self.log.info('[%s]: found Light Device, deviceid=%s', moment().format('YYYYMMDDHHmmss.SSS'), self.device.MyQDeviceId);
}
util.inherits(MyQLightAccessory, MyQAccessory);

MyQLightAccessory.prototype.init = function(platform, device) {
    var self = this;
    self.service = new Service.Switch(self.name);
    self.service.addCharacteristic(LastUpdate);
    MyQLightAccessory.super_.prototype.init.call(self, platform, device);

    self.service.getCharacteristic(Characteristic.On).value = self.currentState;
    self.service.getCharacteristic(Characteristic.Name).value = self.name;
    self.service.getCharacteristic(LastUpdate).value = self.platform.dateTimeToDisplay(self.stateUpdatedTime);

    self.service.getCharacteristic(LastUpdate).on('get', function(cb) {
        cb(null, self.platform.dateTimeToDisplay(self.stateUpdatedTime));
    }.bind(self));

    self.service
        .getCharacteristic(Characteristic.On)
        .on('get', function(callback) {
            self.log.debug("[%s]: Getting current light state...[%s]", moment().format('YYYYMMDDHHmmss.SSS'), self.currentState);
            callback(null, self.currentState);
        }.bind(self))
        .on('set', function(state, callback) {
            if(state !== self.currentState) {
                self.log.debug("[%s]: set current light state...[%s]", moment().format('YYYYMMDDHHmmss.SSS'), state);
                self.platform['light_' + (state ? 'on':'off')].call(self.platform, self.device.MyQDeviceId, function(body){
                    self.log.debug(body);
                    self.currentState = state;
                    self.stateUpdatedTime = moment().format('x');

                    self.service.getCharacteristic(Characteristic.On).setValue(self.currentState);
                    self.service.getCharacteristic(LastUpdate).setValue(self.platform.dateTimeToDisplay(self.stateUpdatedTime));
                    callback(null);
                });
            } else {
                callback(null);
            }
        }.bind(self));
}

MyQLightAccessory.prototype.updateDevice = function(devices) {
    var self = this;
    if(MyQLightAccessory.super_.prototype.updateDevice.call(self, devices) && self.lightstateUpdateTime) {
        if(self.stateUpdatedTime !== self.lightstateUpdateTime && self.service) {
            self.stateUpdatedTime = self.lightstateUpdateTime;
            self.service.getCharacteristic(LastUpdate).setValue(self.platform.dateTimeToDisplay(self.stateUpdatedTime));
        }
        if(self.currentState !== self.lightstate && self.service) {
            self.currentState = self.lightstate === '1' ? true:false;
            self.service.getCharacteristic(Characteristic.On).setValue(self.currentState);
        }
        self.log.debug('[%s]: Light[%s] Light State=[%s], Updated time=[%s]',
            moment().format('YYYYMMDDHHmmss.SSS'),
            self.name,
            self.lightstate === '1' ? 'on':'off',
            self.platform.dateTimeToDisplay(self.stateUpdatedTime)
        );
    }
}

function MyQDoorAccessory(platform, device) {
    MyQAccessory.call(this, platform, device);
}
util.inherits(MyQDoorAccessory, MyQAccessory);

MyQDoorAccessory.prototype.updateDevice = function(devices) {
    var self = this;

    if(MyQDoorAccessory.super_.prototype.updateDevice.call(self, devices)&& self.doorstateUpdateTime) {
        self.updateDoorState.call(self, self.doorstate, self.doorstateUpdateTime);
        self.log.debug('[%s]: Door[%s] Door State=[%s], Updated time=[%s], isunattendedopenallowed=[%s], isunattendedcloseallowed=[%s]',
            moment().format('YYYYMMDDHHmmss.SSS'),
            self.name,
            self.descState(self.currentState),
            self.platform.dateTimeToDisplay(self.stateUpdatedTime),
            self.isunattendedopenallowed,
            self.isunattendedcloseallowed
        );
    }
}
MyQDoorAccessory.prototype.init = function(platform, device) {
    var self = this;

    self.service = new Service.GarageDoorOpener(self.name);
    self.service.addCharacteristic(LastUpdate);

    MyQDoorAccessory.super_.prototype.init.call(self, platform, device);

    if (typeof self.isunattendedopenallowed === 'undefined'){
        self.isunattendedopenallowed = false;
    }
    if (typeof self.isunattendedcloseallowed === 'undefined') {
        self.isunattendedcloseallowed = false;
    }

    self.targetState = self.currentState;

    self.log.info('[%s]: found GarageDoorOpener, deviceid=%s', moment().format('YYYYMMDDHHmmss.SSS'), self.device.MyQDeviceId);

    self.service.getCharacteristic(Characteristic.CurrentDoorState).value = self.currentState;
    self.service.getCharacteristic(Characteristic.TargetDoorState).value = self.currentState;
    self.service.getCharacteristic(LastUpdate).value = self.platform.dateTimeToDisplay(self.stateUpdatedTime);

    self.service.getCharacteristic(LastUpdate).on('get', function(cb) {
        cb(null, self.platform.dateTimeToDisplay(self.stateUpdatedTime));
    }.bind(self));

    self.service
        .getCharacteristic(Characteristic.CurrentDoorState)
        .on('get', function(callback) {
            self.log.debug("[%s]: Getting current door state...[%s]", moment().format('YYYYMMDDHHmmss.SSS'), self.currentState);
            callback(null, self.currentState);
        }.bind(self));
    
    self.service
        .getCharacteristic(Characteristic.TargetDoorState)
        .on('get', function(callback) {
            callback(null, self.targetState);
        }.bind(self))
        .on('set', self.setDoorState.bind(self));
}

MyQDoorAccessory.prototype.setDoorState = function(state, callback) {
    var self = this;
    self.log.warn("[%s]: Set state to %s", moment().format('YYYYMMDDHHmmss.SSS'), state);
    
    if(self.targetState !== state) {
        self.targetState = state;
        if(self.service) {
            self.service.getCharacteristic(Characteristic.TargetDoorState).setValue(self.targetState);
        }
    }
    
    if(state === Characteristic.TargetDoorState.OPEN) {
        if (!self.isunattendedopenallowed) {
            self.log.warn('[%s]: unattended open not allowed', moment().format('YYYYMMDDHHmmss.SSS'));
            callback(new Error('unattended open not allowed'));
        } else if(self.currentState === Characteristic.CurrentDoorState.CLOSED) {
            self.log.warn('opening door');
            self.currentState = Characteristic.CurrentDoorState.OPENING;
            self.platform.door_open.call(self.platform, self.device.MyQDeviceId, function(){
                self.updateDoorState.call(self, '4', moment().format('x'));
                callback(null); 
            });
        } else if(self.currentState === Characteristic.CurrentDoorState.OPEN
            || self.currentState === Characteristic.CurrentDoorState.OPENING) {
            callback(null);
        } else {
            self.log.warn('[%s]: Can not open door, current state is:[%s]', moment().format('YYYYMMDDHHmmss.SSS'), self.currentState);
            callback(new Error('Can not open door, current state not allowed'));
        }
    } else if (state === Characteristic.TargetDoorState.CLOSED) {
        if (!self.isunattendedcloseallowed) {
            self.log.warn('[%s]: unattended close not allowed', moment().format('YYYYMMDDHHmmss.SSS'));
            callback(new Error('unattended open not allowed'));
        } else if(self.currentState === Characteristic.CurrentDoorState.OPEN) {
            self.currentState = Characteristic.CurrentDoorState.CLOSING;
            self.log.warn('[%s]: closing door', moment().format('YYYYMMDDHHmmss.SSS'));
            self.platform.door_close.call(self.platform, self.device.MyQDeviceId, function(){
                self.updateDoorState.call(self, '5', moment().format('x'));
                callback(null); 
            });
        } else if(self.currentState === Characteristic.CurrentDoorState.CLOSED ||
                    self.currentState === Characteristic.CurrentDoorState.CLOSING) {
            callback(null);
        } else {
            self.log.warn('[%s]: Can not close door, current state is:[%s]', moment().format('YYYYMMDDHHmmss.SSS'), self.currentState);
            callback(new Error('Can not close door, current state not allowed'));
        }
    }
}

MyQDoorAccessory.prototype.updateDoorState = function(doorstate, updateTime) {
    var self = this;
    var state = self.currentState;

    if(updateTime < self.stateUpdatedTime && moment().format('x') - self.stateUpdatedTime < 30000) {
        self.log.warn('[%s]: updatetime=%s, self.stateUpdatedTime=%s, now=%s, will do nothing.', moment().format('YYYYMMDDHHmmss.SSS'), updateTime, self.stateUpdatedTime, moment().format('x'));
    } else {
        if(doorstate === '1' || doorstate === '9') {
            state = Characteristic.CurrentDoorState.OPEN;
        } else if(doorstate === '2') {
            state = Characteristic.CurrentDoorState.CLOSED;
        } else if(doorstate === '3') {
            state = Characteristic.CurrentDoorState.STOPPED;
        } else if (doorstate === '4' ||
            (doorstate === '8' && self.currentState === Characteristic.CurrentDoorState.CLOSED)) {
            state = Characteristic.CurrentDoorState.OPENING;
        } else if (doorstate === '5' ||
            (doorstate === '8' && self.currentState === Characteristic.CurrentDoorState.OPEN)) {
            state = Characteristic.CurrentDoorState.CLOSING;
        }
        if(state !== self.currentState && self.service) {
            self.service.getCharacteristic(Characteristic.CurrentDoorState).setValue(state);
        }
        self.currentState = state;

        if(updateTime !== self.stateUpdatedTime && self.service) {
            self.service.getCharacteristic(LastUpdate).setValue(self.platform.dateTimeToDisplay(updateTime));
        }
        self.stateUpdatedTime = updateTime;
    }
    
    if(self.refreshTimer) {
        clearTimeout(self.refreshTimer);
        self.refreshTimer = null;
    }
    if(moment().format('x') - self.stateUpdatedTime < 10000) {
        self.log.debug('[%s] state changed [%s] seconds ago, refreshing. lastupdatetime=[%s]', moment().format('YYYYMMDDHHmmss.SSS'), (moment().format('x') - self.stateUpdatedTime) / 1000, self.stateUpdatedTime);
        self.refreshTimer = setTimeout(function() {
            self.platform.getDeviceAttribute.call(self.platform, self.device.MyQDeviceId, 'doorstate', function(value, updatetime) {
                self.updateDoorState.call(self, value, updatetime);
            }.bind(self));
        }.bind(self), 1000);
    }
}

