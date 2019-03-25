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
function MyQAPI(log, host, userAgent, appId, userName, password)
{
    this.log = log;
    this.host = host;
    this.userAgent = userAgent;
    this.appId = appId;
    this.userName = userName; //self.config['user']
    this.password = password; //self.config['pass']
}
MyQAPI.prototype.processResponse = function(error, response, body) {
    var self = this;
    return new Promise(function(resolve, reject) {
        if(!error && response.statusCode == 200 && body.ReturnCode === '0') {
            resolve(body);
        } else {
            if(error) {
                this.log.error(error);
                reject(error);
                return;
            }
            if(response.statusCode != 200) {
                this.log.error(response);
                reject(response);
                return;
            }
            if(body.returnCode !== '0') {
                this.log.error(body);
                reject(body);
                return;
            }
        }
    });
}
MyQAPI.prototype.login = function() {
    var self = this;
    return new Promise(function(resolve, reject) {
        request.post({
            url : self.host + '/api/v4/User/Validate',
            headers: {
                'User-Agent': self.userAgent,
                'MyQApplicationId': self.appId
            },
            json: {
                username: self.userName,
                password : self.password
            }
        }, function (error, response, body) {
            self.processResponse(error, response, body)
            .then(function(body) {
                self.SecurityToken = body.SecurityToken;
                resolve();
            })
            .catch(function(error) {
                reject(error);
            });
        });
    }).then(function() {
        return self.getuser();
    });
}
MyQAPI.prototype.getuser = function() {
    var self = this;
    return new Promise(function(resolve, reject) {
        request.get({
            url: self.host + '/api/v4/user/getuser',
            json: true,
            headers: {
                'User-Agent': self.userAgent,
                'MyQApplicationId': self.appId,
                'SecurityToken': self.SecurityToken
            }
        }, function (error, response, body) {
            self.processResponse(error, response, body)
            .then(function(body) {
                self.BrandId = body.BrandId;
                self.BrandName = body.BrandName;
                self.log.debug('BrandId:[%s]', body.BrandId);
                self.log.debug('BrandName:[%s]', body.BrandName);
                resolve();
            }).catch(function(error) {
                reject(error);
            });
        });
    });
}
MyQAPI.prototype.getDevices = function () {
    var self = this;
    return new Promise(function(resolve, reject) {
        self.log.debug('retrieving devices');
        if(!self.SecurityToken) {
            self.log.error('security token is not set');
            reject();
            return;
        }
        request.get({
            url : self.host + '/api/v4/userdevicedetails/get',
            json: true,
            headers : {
                'User-Agent': self.userAgent,
                'MyQApplicationId': self.appId,
                'BrandId': self.BrandId,
                'SecurityToken': self.SecurityToken,
                'Culture': 'en'
            }
        }, function (error, response, body) {
            self.processResponse(error, response, body).then(function(body) {
                if(body.Devices && body.Devices.length > 0) {
                    body.Devices.forEach(function(device) {
                        if(device.MyQDeviceTypeId === 2 /*garage door*/
                            || device.MyQDeviceTypeId === 5 /*gate*/
                            || device.MyQDeviceTypeId === 7 /*MyQGarage(no gateway)*/
                            || device.MyQDeviceTypeId === 17 /*Garage Door Opener WGDO*/) {
                            device.isGarageDoor = true;
                        } else if (device.MyQDeviceTypeId === 3 /*light controller*/) {
                            device.isLight = true;
                        } else if (device.MyQDeviceTypeId === 1 /*gateway*/) {
                            device.isGateway = true;
                        }
                    })
                    resolve(body.Devices);
                }
            }).catch(function(error) {
                reject(error);
            });
        });
    });
}
MyQAPI.prototype.getDeviceAttribute = function(deviceid, attributename) {
    var self = this;
    return new Promise(function(resolve, reject) {
        if(!self.SecurityToken) {
            self.log.error('security token is not set');
            reject();
            return;
        }
        request.get({
            url : self.host + '/api/v4/deviceattribute/getdeviceattribute',
            qs : {
                'myQDeviceId': deviceid,
                'attributeName': attributename
            },
            json: true,
            headers : {
                'User-Agent': self.userAgent,
                'MyQApplicationId': self.appId,
                'BrandId': self.BrandId,
                'SecurityToken': self.SecurityToken,
                'Culture': 'en'
            }
        }, function (error, response, body) {
            self.processResponse(error, response, body).then(function(body) {
                self.log.debug('get device attribute finished. id[%s], attributename[%s], value[%s], updatetime[%s]',
                deviceid, attributename, body.AttributeValue, body.UpdatedTime);
                resolve({
                    Value: body.AttributeValue,
                    updateTime: body.UpdatedTime
                });
            }).catch(function(error) {
                reject(error);
            });
        });
    });
}
function MyQPlatform(log, config) {
    this.config = config;
    this.log = log;
    if(config.brand !== 'Craftsman') {
        this.host = 'https://myqexternal.myqdevice.com';
        this.appId = 'NWknvuBd7LoFHfXmKNMBcgajXtZEgKUh4V7WNzMidrpUUluDpVYVZx+xT4PCM5Kx';
    } else {
        this.host = 'https://craftexternal.myqdevice.com';
        this.appId = 'OA9I/hgmPHFp9RYKJqCKfwnhh28uqLJzZ9KOJf1DXoo8N2XAaVX6A1wcLYyWsnnv';
    }
    if(config.appId) {
        this.appId = config.appId;
    }
    this.refreshInterval = 30 * 1000;
    this.userAgent = config.brand + '/3.4 (iPhone; iOS 9.2.1; Scale/2.00)';
    this.myqapi = new MyQAPI(this.log, this.host, this.userAgent, this.appId, this.config['user'], this.config['pass']);
}

MyQPlatform.prototype.retry_login = function(onSuccess) {
    var self = this;
    self.log.warn('retrying login.');

    self.login(onSuccess, function(returnCode, errorMessage) {
        setTimeout(function() {
            self.retry_login.call(self, onSuccess);
        }.bind(self), self.refreshInterval);
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
            self.log.info('sendcommand successed, command=[%s],state=[%s]', command, state);
            callback(body);
        } else {
            self.log.error('send command failed.');
            self.log.error(error);
            if (response) self.log.error(response);
            if (body) self.log.error(body);
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
    this.myqapi.login()
    .then(function() {
        return self.myqapi.getDevices();
    })
    .then(function(devices) {
        
        var result = [];
        devices.forEach(function(device) {
            if(device.isGarageDoor) {
                var accessory = new MyQDoorAccessory(self, device);
                if(!self.config.ignoreDeviceWithoutDescription || accessory.isDescriptionSet) {
                    result.push(accessory);
                }
                //TODO lights
            }
        });
        self.LoadedDevices = result;
        self.timer = setTimeout(function() {
            self.deviceStateTimer();
        }, self.refreshInterval);
        callback(result);
    })
    .catch(function(error) {
        throw new Error("homebridge-platform-myq has intentially brought down HomeBridge - please restart!");
    });
    
    /*self.login.call(self, function() {
        self.getDevices.call(self, function(door_devices, light_devices, gateway_devices) {
            self.foundAccessories = [];
            door_devices.forEach(function(device) {
                var accessory = new MyQDoorAccessory(self, device);
                if(!self.config.ignoreDeviceWithoutDescription || accessory.isDescriptionSet) {
                    self.foundAccessories.push(accessory);
                }
            });
            light_devices.forEach(function(device) {
                var accessory = new MyQLightAccessory(self, device);
                if(!self.config.ignoreDeviceWithoutDescription || accessory.isDescriptionSet) {
                    self.foundAccessories.push(accessory);
                }
            });
            callback(self.foundAccessories);
            self.timer = setTimeout(self.deviceStateTimer.bind(self), self.refreshInterval);
        }, function(returnCode, errorMessage) {
            self.log.error('MyQ Server error when list accessories, returncode=[%s], errormessage=[%s]', returnCode, errorMessage);
            throw new Error("homebridge-platform-myq has intentially brought down HomeBridge - please restart!");
        });
    }, function(returnCode, errorMessage) {
        self.log.error('MyQ Server error, returncode=[%s], errormessage=[%s]', returnCode, errorMessage);
        throw new Error("homebridge-platform-myq has intentially brought down HomeBridge - please fix your configuration!");
    });*/
}
MyQPlatform.prototype.deviceStateTimer = function() {
    var self = this;
    if(this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
    }
    this.getDevices().then(function(devices) {
        devices.forEach(function(device) {
            var loadedDevice = self.LoadedDevices.find(function(dev) {
                return device.MyQDeviceId == dev.device.MyQDeviceId;
            });
            if(loadedDevice) {
                loadedDevice.updateDevice(device);
            } else {
                self.log.error('Can not find device');
                self.log.error(device);
            }
        });
        
    }).catch(function(error) {

    });
    this.timer = setTimeout(function() {
        self.deviceStateTimer();
    }, self.refreshInterval);
}

MyQPlatform.prototype.dateTimeToDisplay = function(unixtime) {
    return moment(unixtime, 'x').fromNow()
}

function MyQAccessory(platform, device) {
    this.platform = platform;
    this.device = device;
    this.log = platform.log;
    this.name = this.getAttr('desc') || device.SerialNumber;
    //self.updateDevice([device]);
}
MyQAccessory.prototype.getAttr = function(attr, cb) {
    return this.getDeviceAttr(this.device, attr, cb);
}
MyQAccessory.prototype.getDeviceAttr = function(device, attr, cb) {
    var v = device.Attributes.find(function(attribute) {
        return attribute.AttributeDisplayName == attr;
    });
    return v && (cb ? cb(v) : v.Value);
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
    /*var self = this;
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
                self.isDescriptionSet = true;
            }
        } else if(attribute.AttributeDisplayName === 'isunattendedopenallowed') {
            self.isunattendedopenallowed = attribute.Value === '1';
        } else if(attribute.AttributeDisplayName === 'isunattendedcloseallowed') {
            self.isunattendedcloseallowed = attribute.Value === '1';
        } else if(attribute.AttributeDisplayName === 'fwver') {
            self.fwver = attribute.Value;
        }
    });
    return true;*/
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
    self.log.info('found Gateway Device, deviceid=%s', self.device.MyQDeviceId);
}

util.inherits(MyQGateWayAccessory, MyQAccessory);

MyQGateWayAccessory.prototype.updateDevice = function(devices) {
    var self = this;
    MyQGateWayAccessory.super_.prototype.updateDevice.call(self, devices);
}

function MyQLightAccessory(platform, device) {
    MyQAccessory.call(this, platform, device);
    var self = this;
    this.log.info('found Light Device, deviceid=%s', this.device.MyQDeviceId);
    this.service = new Service.Switch(this.name);
    this.service.addCharacteristic(LastUpdate);
    this.service.getCharacteristic(Characteristic.On).value = this.currentState;
    this.service.getCharacteristic(Characteristic.Name).value = this.name;
    this.service.getCharacteristic(LastUpdate).value = this.platform.dateTimeToDisplay(this.stateUpdatedTime);

    this.service.getCharacteristic(LastUpdate).on('get', function(callback) {
        callback(null, self.platform.dateTimeToDisplay(self.stateUpdatedTime));
    });

    this.service.getCharacteristic(Characteristic.On)
    .on('get', function(callback) {
        self.log.debug("Getting current light state...[%s]", self.currentState);
        callback(null, self.currentState);
    })
    .on('set', function(state, callback) {
        if(state !== self.currentState) {
            self.log.debug("set current light state...[%s]", state);
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
    });
}
util.inherits(MyQLightAccessory, MyQAccessory);


MyQLightAccessory.prototype.updateDevice = function(devices) {
    /*var self = this;
    if(MyQLightAccessory.super_.prototype.updateDevice.call(self, devices) && self.lightstateUpdateTime) {
        if(self.stateUpdatedTime !== self.lightstateUpdateTime && self.service) {
            self.stateUpdatedTime = self.lightstateUpdateTime;
            self.service.getCharacteristic(LastUpdate).setValue(self.platform.dateTimeToDisplay(self.stateUpdatedTime));
        }
        if(self.currentState !== self.lightstate && self.service) {
            self.currentState = self.lightstate === '1' ? true:false;
            self.service.getCharacteristic(Characteristic.On).setValue(self.currentState);
        }
        self.log.debug('Light[%s] Light State=[%s], Updated time=[%s]',
            self.name,
            self.lightstate === '1' ? 'on':'off',
            self.platform.dateTimeToDisplay(self.stateUpdatedTime)
        );
    }*/
}

function MyQDoorAccessory(platform, device) {
    var self = this;
    MyQAccessory.call(this, platform, device);
    this.service = new Service.GarageDoorOpener(this.name);
    this.service.addCharacteristic(LastUpdate);

    this.log.info('found GarageDoorOpener, deviceid=%s', this.device.MyQDeviceId);
    var doorState = this.translateDoorState(this.getAttr('doorstate'));
    this.service.getCharacteristic(Characteristic.CurrentDoorState).value = doorState;
    this.targetState = doorState;
    if(doorState == Characteristic.CurrentDoorState.OPENING) {
        this.targetState = Characteristic.CurrentDoorState.OPEN;
    } else if(doorState == Characteristic.CurrentDoorState.CLOSING) {
        this.targetState = Characteristic.CurrentDoorState.CLOSED
    }

    this.service.getCharacteristic(Characteristic.TargetDoorState).value = this.targetState;
    this.service.getCharacteristic(LastUpdate).value = this.platform.dateTimeToDisplay(this.getAttr('doorstate', function(attr) {
        return attr.UpdatedTime;
    }));

    this.service.getCharacteristic(LastUpdate).on('get', function(cb) {
        cb(null, self.platform.dateTimeToDisplay(self.stateUpdatedTime));
    });

    this.service.getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', function(callback) {
        // calling api for latest state
        self.platform.getDeviceAttribute(self.device.MyQDeviceId, 'doorstate')
        .then(function(result) {
            var state = self.translateDoorState(result.Value);
            self.log.debug("Getting current door state...[%s]", state);
            callback(state);
        })
        .reject(function() {
            callback();
        });
    });

    this.service.getCharacteristic(Characteristic.TargetDoorState)
    .on('get', function(callback) {
        callback(null, self.targetState);
    })
    .on('set', function(state) {
        self.setDoorState(state);
    });
}
util.inherits(MyQDoorAccessory, MyQAccessory);

MyQDoorAccessory.prototype.updateDevice = function(devices) {
    var currentDoorState = this.getAttr('doorstate');
    var doorState = this.getDeviceAttr('doorstate');
    if(doorstate != currentDoorState) {
        this.service.getCharacteristic(Characteristic.CurrentDoorState).setValue(
            this.translateDoorState(doorstate)
        );
    }
    this.device = device;
    this.log.debug('Door[%s] Door State=[%s], Updated time=[%s], isunattendedopenallowed=[%s], isunattendedcloseallowed=[%s]',
        this.name,
        this.descState(this.getAttr('doorstate')),
        this.platform.dateTimeToDisplay(this.getAttr('doorstate', function(attr) {
            return attr.UpdatedTime;
        })),
        this.isunattendedopenallowed,
        this.isunattendedcloseallowed
    );
}

MyQDoorAccessory.prototype.setDoorState = function(state, callback) {
    var self = this;
    self.log.warn("Set state to %s", state);

    if(self.targetState !== state) {
        self.targetState = state;
        if(self.service) {
            self.service.getCharacteristic(Characteristic.TargetDoorState).setValue(self.targetState);
        }
    }

    if(state === Characteristic.TargetDoorState.OPEN) {
        if (!self.isunattendedopenallowed) {
            self.log.warn('unattended open not allowed');
            callback(new Error('unattended open not allowed'));
        } else if(self.currentState === Characteristic.CurrentDoorState.CLOSED ||
            self.currentState === Characteristic.CurrentDoorState.STOPPED) {
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
            self.log.warn('Can not open door, current state is:[%s]', self.currentState);
            callback(new Error('Can not open door, current state not allowed'));
        }
    } else if (state === Characteristic.TargetDoorState.CLOSED) {
        if (!self.isunattendedcloseallowed) {
            self.log.warn('unattended close not allowed');
            callback(new Error('unattended open not allowed'));
        } else if(self.currentState === Characteristic.CurrentDoorState.OPEN ||
            self.currentState === Characteristic.CurrentDoorState.STOPPED) {
            self.currentState = Characteristic.CurrentDoorState.CLOSING;
            self.log.warn('closing door');
            self.platform.door_close.call(self.platform, self.device.MyQDeviceId, function(){
                self.updateDoorState.call(self, '5', moment().format('x'));
                callback(null);
            });
        } else if(self.currentState === Characteristic.CurrentDoorState.CLOSED ||
                    self.currentState === Characteristic.CurrentDoorState.CLOSING) {
            callback(null);
        } else {
            self.log.warn('Can not close door, current state is:[%s]', self.currentState);
            callback(new Error('Can not close door, current state not allowed'));
        }
    }
}
MyQDoorAccessory.prototype.translateDoorState = function(doorstate, currentState){
    var state = Characteristic.CurrentDoorState.OPEN
    if(doorstate === '1' || doorstate === '9') {
        state = Characteristic.CurrentDoorState.OPEN;
    } else if(doorstate === '2') {
        state = Characteristic.CurrentDoorState.CLOSED;
    } else if(doorstate === '3') {
        state = Characteristic.CurrentDoorState.STOPPED;
    } else if (doorstate === '4') {
        state = Characteristic.CurrentDoorState.OPENING;
    } else if (doorstate === '8' && currentState === Characteristic.CurrentDoorState.CLOSED) {
        state = Characteristic.CurrentDoorState.OPENING;
    } else if (doorstate === '5') {
        state = Characteristic.CurrentDoorState.CLOSING;
    } else if (doorstate === '8' && currentState === Characteristic.CurrentDoorState.OPEN) {
        state = Characteristic.CurrentDoorState.CLOSING;
    } else if(doorstate === '8') {
        // we do not know current state, use Closing
        state = Characteristic.CurrentDoorState.CLOSING;
    }
    return state;
}
MyQDoorAccessory.prototype.updateDoorState = function(doorstate, updateTime) {
    var self = this;
    var state = self.currentState;

    if(updateTime < self.stateUpdatedTime && moment().format('x') - self.stateUpdatedTime < 30000) {
        self.log.warn('updatetime=%s, self.stateUpdatedTime=%s, now=%s, will do nothing.', updateTime, self.stateUpdatedTime, moment().format('x'));
    } else {
        state = self.translateDoorState(doorstate, self.currentState);

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
        self.log.debug('state changed [%s] seconds ago, refreshing. lastupdatetime=[%s]', (moment().format('x') - self.stateUpdatedTime) / 1000, self.stateUpdatedTime);
        self.refreshTimer = setTimeout(function() {
            self.platform.getDeviceAttribute.call(self.platform, self.device.MyQDeviceId, 'doorstate', function(value, updatetime) {
                self.updateDoorState.call(self, value, updatetime);
            }.bind(self));
        }.bind(self), 1000);
    }
}
