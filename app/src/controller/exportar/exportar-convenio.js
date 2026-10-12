;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        _ = require('underscore');
    
    let instance = null;
    
   
    function ExportarConvenio() {
        const self = this;
        
        // Retorna todos os convênios
        self.exportar = function(empresaId) {
            return new Promise( function ( resolve, reject){
                mysql.query('SELECT id, nome, ativo FROM convenio WHERE empresa_id = ?', [empresaId], function(err, result){
                    if(err || result.length === 0) return reject();
                    resolve(result);
                });
            });
        };//convenios
        
    }
    
    if(instance === null) instance = new ExportarConvenio();
    module.exports = ExportarConvenio;
    ExportarConvenio.Exportar = instance;
}());