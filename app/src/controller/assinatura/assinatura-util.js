/*
 * Funções que serão usados em diversos locais
 * Principalmente funções relacionados a cache e controle de assinaturas 
 */

;(function () {
    "use strict";
    
    const conexoes = require('src/util/conexoes'),
    assinatura = require('./assinatura');
    
    let instance = null,
    redis = conexoes.redis(),
    // tempoSessao = 60 * 60 * 10; // 10 horas
    tempoSessao = 60 * 60; // 1 hora

    function AssinaturaUtil() {
        const self = this;

        self.setCacheAssinatura = setCacheAssinatura;
        self.getCacheAssinatura = getCacheAssinatura;
        self.contaBloqueada = contaBloqueada;
        self.limpaCacheAssinatura = limpaCacheAssinatura;
        self.profissionalEAssinante = profissionalEAssinante;

        // MÉTODOS PÚBLICOS

        /**
         * Retorna se uma empresa esta com o plano pró bloqueado por falta de 
         * pagamento.
         * 
         * RETORNO
         * - reject = erro ao tentar determinar se esta ou não bloqueada
         * - resolve
         *   TRUE  = esta bloqueada
         *   FALSE = não esta bloqueada
         * 
         * @param {int} empresaID PK de uma empresa
         */
        function contaBloqueada( empresaID ) {
            return new Promise( ( resolve, reject ) => {
                getCacheAssinatura( empresaID )
                .then( assinatura => {
                    if( assinatura.plano != 'pró' ) return resolve();
                    return resolve( assinatura.status == '4' );
                })
                .catch( erro => reject(erro) );
            });
        }


        function setCacheAssinatura( empresaID ) {
            let chave = 'assinatura:' + empresaID;

            const Assinatura = new assinatura( {empresa_id: empresaID} );
            Assinatura.situacaoAssinatura().then( assinatura => {
                _gravaRedis( chave, JSON.stringify( assinatura ), tempoSessao );
            });
        }

        function getCacheAssinatura( empresaID ) {
            return new Promise( ( resolve, reject ) => {
                let chave = 'assinatura:' + empresaID;
                
                redis.get( chave, (erro, result ) => {
                    if( !erro && result ) return resolve( JSON.parse( result ) );
                    
                    // não encontrou no redis, busca no mongodb
                    const Assinatura = new assinatura( {empresa_id: empresaID} );
                    Assinatura.situacaoAssinatura()
                    .then( assinatura => {
                        resolve( assinatura );
                        _gravaRedis( chave, JSON.stringify( assinatura ), tempoSessao ); // atualiza o cache
                    })
                    .catch( erro => reject( 'Erro interno' ));
                });
            });
        }

        /**
         * Remove o cache da assinatura de uma empresa
         */
        function limpaCacheAssinatura( empresaID ) {
            redis.del( 'assinatura:' + empresaID );
        }

        /**
         * Verifica se um profissional tem o plano PRÓ ativo
         * 
         * @param {Integer} empresaID PK da empresa
         * @param {Integer} profissionalID PK do prifissional
         * 
         * @returns {Promise<null|Integer>} se resolver é porque o profissional é assinante, se rejeitou tem dois
         * valores possíveis. 1 = conta bloqueada, 2 = o profissional não é assinante
         */
        function profissionalEAssinante ( empresaID, profissionalID ) {
            return new Promise( (resolve, reject) => {
                getCacheAssinatura( empresaID )
                .then( assinatura => {
                    if( assinatura.plano != 'pró' ) {
                        return reject('Recurso disponível apenas para assinantes');
                    }
    
                    if(assinatura.status == '4') { // conta bloqueada
                        return reject(1);// conta bloqueada
                    }
                    if( assinatura.profissional == 'todos') return resolve(); // ativo para todos os profissionais
    
                    if( !assinatura.profissionais.includes( profissionalID ) ) { // não esta ativo para esse profissional
                        return reject( 2 ); // Recurso disponível apenas para assinantes
                    }
                    resolve();
                })
                .catch( erro => {
                    reject('Erro interno');
                });
            });
        }


        // Métodos privados
        function _gravaRedis( chave, dados, _tempoSessao ) {
            redis.set( chave, dados );
            if( _tempoSessao ) { redis.expire( chave, _tempoSessao); }
        }
    }

    if(instance === null) instance = new AssinaturaUtil();
    module.exports = AssinaturaUtil;
    AssinaturaUtil.AssinaturaUtil = instance;
}());