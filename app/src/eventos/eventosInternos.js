/* jshint -W030 */
{ 
    "use strict";

    /**
     * Emissor e receptor de eventos internos
     */

    const EventEmitter = require('events').EventEmitter;

    class EventosInternos extends EventEmitter {
        constructor () {
            super();
        }

        setSocket(_sio) {
            this.sio = _sio;
        }

        getSocket() {
            return this.sio;
        }
    }

    module.exports = new EventosInternos();
}