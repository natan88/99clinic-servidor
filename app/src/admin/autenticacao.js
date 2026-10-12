/* jshint -W030 */
{ 
    "use strict";

    /**
     * Autentica um operador da 99Clinic, que irá gerenciar as contas dos clientes
     */

    // const
    //     mysql = require('src/util/conexoes');
        // crypto = require('crypto'),
        // uuid = require('uuid');

    class AdminAutenticacao {
        constructor( ) {
            this.tokenTemporario = '4111185Sasdf8Lls8_s-f6';// TODO: não será necessário depois de implmentar todos os métodos
        }

        /**
         * TODO: implementar a autenticação real
         */
        logar ( login, password ) {
            return new Promise( (resolve, reject ) => {
                let erros = {};
                if( !login ) erros.login = 'Obrigatório';
                if( !password ) erros.password = 'Obrigatório';
        
                if( login != 'jose@gmail.com' ) erros.login = 'Inválido';
                if( password != '123456' ) erros.password = 'Inválido';
                
                if( Object.keys( erros ).length > 0 ) {
                    return reject( erros );
                }
        
                resolve( this.tokenTemporario );
            });
        } // logar

        /**
         * Remove a credencial (token) que permite que o usuário volte a se
         * conectar no websocket
         * @param {string} token credencial para se autenticar no websocket
         */
        logout ( token ) {
            // FIXME: implemetar
        } // logout

        /**
         * Verifica se o token informado na conexão com o websoket é valido
         * 
         * O objetivo é verificar se pode autorizar a conexão com o websoket ao
         * portador do token
         * 
         * TODO: implemetar. A atual é um mockup
         * @param {string} token token gerado no método "logar"
         */
        apertoDeMao ( token ) {
            return new Promise( (resolve, reject ) => {
                if( token != this.tokenTemporario ) return reject();
                resolve({
                    id: 99,
                    nome: 'Natanael'
                });
            });
        } // logout

    } // fim classe

    module.exports = new AdminAutenticacao();
}