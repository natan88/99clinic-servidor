;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js');
    
    let instance = null;
   
   
    function ExportarServico() {
        const self = this;
        
        self.exportar = function(empresaID) {
            return new Promise( ( resolve ) => {
                mysql.query(`SELECT id, nome, COALESCE(descricao, '') AS descricao, valor, tempo, prazo_retorno, ativo FROM servico WHERE empresa_id = ?`, [empresaID], (err, result) => {
                    if(err) return reject();
                    resolve(result);
                });
            });
        };//servicos
        /*-------------------------- fim SERVIÇOS ------------------------*/
        
    }
    
    if(instance === null) instance = new ExportarServico();
    module.exports = ExportarServico;
    ExportarServico.Exportar = instance;
}());