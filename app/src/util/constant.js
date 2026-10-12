/**
 * Todas as constantes devem ficar aqui
 */

;(function () {
    "use strict";
    module.exports = Object.freeze({  
        /**
         * Namespaces websocket
         */
        WS_NSP_ADMIN: '/99clinic',// administração interna 99Clinic
        WS_NSP_CLIENTE: '/app',

        /**
         * Costantes sobre assinatura, incluíndo
         */
        assinatura: {

            /**
             * Quantidade de dias para o vencimento da fatura, a contar da data
             * final do período de cobrança. Ex. se a fatura esta sendo cobrada no
             * perído de 01/01/2019 a 01/02/2019 (dt_inicio e dt_fim respectivamente), 
             * a data 'dt_fim' é a referência para a data de vencimento (dt_vencimento). 
             * Por tanto, dt_vencimento será = dt_fim + prazoVencimentoFatura dias
             * Para esse exemplo, para prazoVencimentoFatura = 5, 
             * dt_vencimento será 06/02/2019
             */
            prazoVencimentoFatura: process.env.FATURA_PRAZO_VENCIMENTO || 5,

            /**
             * Quantidade de dias após o vencimento da fatura a mesma deve ser
             * considerada NÃO paga. Fatura depois desse prazo, se não for paga,
             * deve ter o status alterado para NÃO PAGO
             * 
             * IMPORTANTE: por conta da forma como o MySQL funciona, deve ser informado
             * a quantidade de dias desejado + 1. Ex: para bloqueio com 5 dias, informar 6
             */
            prazoBloqueiFatura: process.env.FATURA_PRAZO_BLOQUEIO || 5
        }

    });
}());