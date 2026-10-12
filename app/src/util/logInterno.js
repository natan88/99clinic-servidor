/* jshint -W030 */
{
    "use strict";
    
    const mysql = require('src/util/conexoes.js');

    /**
     * Registra no banco de dados os erros/falhas do sistema. Por exmeplo, se 
     * houver alguma falha ao enviar e-mail ou ao salvar um arquivo no serviço
     * de storage
     */
    class LogInterno {
        constructor () { }

        registraErro( erro, tag, local ) {
            if( !tag || !erro ) return;
            mysql.query(`INSERT INTO log_interno (local, erro, tag) VALUES ?`, [[[ local, erro, tag ]]]);
        }
    }

    module.exports = new LogInterno();
}