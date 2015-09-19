var Net      = require('net'),
    hostname = require("os").hostname();

var ZabbixSender = module.exports = function(opts) {
    opts = (typeof opts !== 'undefined') ? opts : {};

    this.host = opts.host || 'localhost';
    this.port = parseInt(opts.port) || 10051;
    this.timeout = parseInt(opts.timeout) || 5000;
    this.with_timestamps = opts.with_timestamps || false;
    this.items_host = opts.items_host || hostname;

    // our items array
    this.items = [];
}

ZabbixSender.prototype.addItem = function(host, key, value) {
    if (arguments.length != 3) {
        if (arguments.length < 2) {
            throw new Error('addItem requires 2 or 3 arguments')
        }

        // if just 2 args provided
        value = key;
        key   = host;
        host  = this.items_host;
    }

    length = this.items.push({
        host:  host,
        key:   key,
        value: value
    });

    if (this.with_timestamps) {
        this.items[length - 1].clock = Date.now() / 1000 | 0;
    }
}

ZabbixSender.prototype.clearItems = function() {
    this.items = [];
}

ZabbixSender.prototype.send = function(callback, clear) {
    // make sure callback is a function
    callback = (typeof callback === 'function') ? callback : function() {};

    var self     = this,
        error    = false,
        data     = prepareData(this.items, this.with_timestamps),
        client   = new Net.Socket(),
        response = new Buffer(0);

    // uncoment when debugging
    console.log(data.slice(13).toString());

    // set socket timout
    client.setTimeout(this.timeout);

    client.connect(this.port, this.host, function() {
        client.write(data);
    });

    client.on('data', function(data) {
        response = Buffer.concat([response, data]);
    });

    client.on('timeout', function() {
        error = new Error("socket timed out after " + self.timeout / 1000 + " seconds");
        client.destroy();
    });

    client.on('error', function(err) {
        error = err;
    });

    client.on('close', function() {
        // bail out on any error
        if (error) {
            return callback(error, {});
        }

        // bail out if got wrong response
        if (response.slice(0, 5).toString() !== 'ZBXD\1') {
            return callback(new Error("got invalid response from server"), {});
        }

        // all clear, return the result
        clear && self.clearItems();
        callback(null, JSON.parse(response.slice(13)));
    });
}

// takes items array and prepares payload for sending
function prepareData(items, with_timestamps) {
    var data = {
        request: 'sender data',
        data: items
    };

    if (with_timestamps) {
        data.clock = Date.now() / 1000 | 0;
    }

    var payload = new Buffer(JSON.stringify(data), 'utf8'),
        header  = new Buffer(5 + 4); // ZBXD\1 + packed payload.length

    header.write('ZBXD\1');
    header.writeInt32LE(payload.length, 5);
    return Buffer.concat([header, new Buffer('\0\0\0\0'), payload]);
}