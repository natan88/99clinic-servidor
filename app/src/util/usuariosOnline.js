/* jshint -W030 */
{ 
    "use strict";

    /**
     * Registra os usuários online, offline
     */

    const redis = require('src/util/conexoes').redis();

    class UsuariosOnline {
        constructor () {
            // this.tempoSessao = 60 * 60 * 10; // 10 horas
            this.tempoSessao = 60 * 10; // 10 minutos
            this.chave = 'usuarios_online:{empresaID}:{usuarioID}';
        }

        _getChave( empresaID, usuarioID ) {
            let chave = this.chave.replace('{empresaID}', empresaID);
            return ( chave.replace('{usuarioID}', usuarioID) );
        }

        /**
         * Sempre que o app for inicializado, deve chamar essa função para remover
         * todas as referencias de usuários logados, evita que usuários sejam
         * considerados ONLINE quando estão offline
         */
        limpaDadosAntigos() {
            const chave = 'usuarios_online:*';
            
            redis.scan('0', 'MATCH', chave, (erro, result ) => {
                if( erro || !result ) return;
                if( result.length < 2 ) return;
                if( result[1].length == 0 ) return;

                redis.del( result[1], ( erro2, result2 ) => {});
            });
        }

        setOnline( empresaID, usuarioID  ) {
            const chave = this._getChave( empresaID, usuarioID );

            redis.incr( chave, ( erro, result ) => {
                if( result == 0 ) redis.incr( chave );
            });
            redis.expire( chave, this.tempoSessao );
        }

        setOffline( empresaID, usuarioID  ) {
            const chave = this._getChave( empresaID, usuarioID );
            redis.decr( chave, ( erro, result ) => {
                if( result < 1 ) redis.del( chave );
            });
        }

        estaOnline( empresaID, usuarioID ) {
            const chave = this._getChave( empresaID, usuarioID );
            return new Promise( ( resolve, reject ) => {
                redis.exists( chave, ( erro, result ) => {
                    if( erro ) return reject();
                    resolve( result === 1 );
                });
            });
        }

        /**
         * Retornando os IDs dos usuários logados
         */
        getUsuariosOnline( empresaID ) {
            const chave = this._getChave( empresaID, '[0-9]*' );

            return new Promise( ( resolve, reject ) => {
                redis.scan('0', 'MATCH', chave, (erro, result ) => {
                    let retorno = [];
                    if( erro || !result ) return resolve( retorno );
                    if( result.length < 2 ) return resolve( retorno );

                    let temp;
                    retorno = result[1].map( r => {
                        temp = r.split(':');
                        return parseInt( temp[2] );
                    });

                    resolve( retorno );
                });
            });
        }

        /**
         * Reinicia a contagem regressiva para o dado expirar, se a chave tiver
         * sido expirada, chama a função para recriar
         */
        updateTTL( empresaID, usuarioID  ) {
            const chave = this._getChave( empresaID, usuarioID );
            redis.expire( chave, this.tempoSessao, ( erro, result ) => {
                if( erro || !result ) return;

                // se a chave tiver sido expirada, cria
                if( result == 0 ) this.setOnline( empresaID, usuarioID );
            });
        }
    }

    module.exports = new UsuariosOnline();
}