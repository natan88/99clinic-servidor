;(function () {
    "use strict";

    const fs = require("fs"),
        Email = require("src/util/email.js").Email,
        // moment = require('moment'),
        cfg = require("src/util/config.js"),

        path = {
            assinaturaAssinou: require.resolve('src/email/assinatura-assinou.html'),
            assinaturaCancelada: require.resolve('src/email/assinatura-cancelada.html'),
            assinaturaCancelada99: require.resolve('src/email/assinatura-cancelada99.html'),
            assinaturaBloqueada: require.resolve('src/email/assinatura-bloqueada.html'),
            assinaturaDesbloqueada: require.resolve('src/email/assinatura-desbloqueada.html'),
            assinaturaReativada: require.resolve('src/email/assinatura-reativada.html'),

            faturaGerada: require.resolve('src/email/fatura-gerada.html'),
            faturaPagaTotal: require.resolve('src/email/fatura-paga.html'),
            faturaPagaParcial: require.resolve('src/email/fatura-paga-parcial.html'),
            faturaInadimplente: require.resolve('src/email/fatura-inadimplente.html'),
            faturaAtrasa: require.resolve('src/email/fatura-atrasada.html'),
            faturaCancelada: require.resolve('src/email/fatura-cancelada.html'),
            faturaPerdoada: require.resolve('src/email/fatura-perdoada.html'),
            faturaStatusAlterado: require.resolve('src/email/fatura-status-alterado.html')
        };
        
    
    
    function EnviaEmail() {
        const self = this;

        self.assinaturaAssinou = EnviaEmailAssinaturaAssinou;
        self.assinaturaCancelada = EnviaEmailAssinaturaCancelada;
        self.assinaturaCancelada99 = EnviaEmailAssinaturaCancelada99;
        self.assinaturaBloqueada = EnviaEmailAssinaturaBloqueada;
        self.assinaturaDesbloqueada = EnviaEmailAssinaturaDesbloqueada;
        self.assinaturaReativada = EnviaEmailAssinaturaReativada;

        self.faturaGerada = EnviaEmailFaturaGerada;
        self.faturaPagaTotal = EnviaEmailFaturaPagaTotal;
        self.faturaPagaParcial = EnviaEmailFaturaPagaParcial;
        self.faturaInadimplente = EnviaEmailFaturaInadimplente;
        self.faturaAtrasa = EnviaEmailFaturaAtrasa;
        self.faturaCancelada = EnviaEmailFaturaCancelada;
        self.faturaPerdoada = EnviaEmailFaturaPerdoada;
        self.faturaStatusAlterado = EnviaEmailFaturaStatusAlterado;


        /** ASSINATURA 
         * ========================================================== */

        /**
         * Envia e-mail quando para o cliente quando o mesmo assina a fatura
         */
        function EnviaEmailAssinaturaAssinou( emailDestinatario, nomeAssinante, data, vencimento, formaPagamento ) {
            fs.readFile( path.assinaturaAssinou, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{assinaturaData}}/g, data);
                texto = texto.replace(/{{assinaturaVencimento}}/g, vencimento);
                texto = texto.replace(/{{formaPagamento}}/g, formaPagamento);
                
                Email.setAssunto("99Clinic - Confirmação de assinatura").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        /**
         * 
         */
        function EnviaEmailAssinaturaCancelada( emailDestinatario, nomeAssinante, assinaturaData, cancelamentoData ) {
            fs.readFile( path.assinaturaCancelada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{assinaturaData}}/g, assinaturaData);
                texto = texto.replace(/{{cancelamentoData}}/g, cancelamentoData);
                
                Email.setAssunto("99Clinic - Assinatura cancelada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailAssinaturaCancelada99( emailDestinatario, nomeAssinante, assinaturaData, cancelamentoData ) {
            fs.readFile( path.assinaturaCancelada99, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{assinaturaData}}/g, assinaturaData);
                texto = texto.replace(/{{cancelamentoData}}/g, cancelamentoData);
                
                Email.setAssunto("99Clinic - Assinatura cancelada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailAssinaturaBloqueada( emailDestinatario, nomeAssinante ) {
            fs.readFile( path.assinaturaBloqueada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                
                Email.setAssunto("99Clinic - Conta bloqueada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailAssinaturaDesbloqueada( emailDestinatario, nomeAssinante ) {
            fs.readFile( path.assinaturaDesbloqueada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                
                Email.setAssunto("99Clinic - Conta desbloqueada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailAssinaturaReativada( emailDestinatario, nomeAssinante, assinaturaData, cancelamentoData, reativacaoData, assinaturaVencimento, formaPagamento ) {
            fs.readFile( path.assinaturaReativada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{assinaturaData}}/g, assinaturaData);
                texto = texto.replace(/{{cancelamentoData}}/g, cancelamentoData);
                texto = texto.replace(/{{reativacaoData}}/g, reativacaoData);
                texto = texto.replace(/{{assinaturaVencimento}}/g, assinaturaVencimento);
                texto = texto.replace(/{{formaPagamento}}/g, formaPagamento);
                
                Email.setAssunto("99Clinic - Assinatura reativada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        /** FATURA 
         * ========================================================== */
        
        /**
         * Envia e-mail ao cliente informando que uma fatura foi gerada
         */
        function EnviaEmailFaturaGerada( emailDestinatario, nomeDestinatario, fatura ) {
            fs.readFile( path.faturaGerada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeDestinatario || '');            
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataEmissao}}/g, fatura.data);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valor);
                texto = texto.replace(/{{faturaLink}}/g, fatura.link);
                
                Email.setAssunto("99Clinic - Aviso de fatura gerada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }
        
        /*
         * Envia e-mail ao cliente informando que uma fatura foi paga totalmente
         * Enviar para o e-mail de cobrança
         */
        function EnviaEmailFaturaPagaTotal( emailDestinatario, nomeDestinatario, fatura ) {
            fs.readFile( path.faturaPagaTotal, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeDestinatario || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataPagamento}}/g, fatura.dataPg);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                texto = texto.replace(/{{faturaValorRecebido}}/g, fatura.valorRecebido);

                let msgSaldo = '';
                if( fatura.valorRecebidoAnteriormente ) {
                    msgSaldo = '<strong style="display:inline;">Valor recebido anteriormente</strong>: R$ ' + fatura.valorRecebidoAnteriormente;
                }
                texto = texto.replace(/{{saldoAnterior}}/g, msgSaldo );
                
                Email.setAssunto("99Clinic - Confirmação de pagamento").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        /*
         * Envia e-mail ao cliente informando que uma fatura foi paga totalmente
         * Enviar para o e-mail de cobrança
         */
        function EnviaEmailFaturaPagaParcial( emailDestinatario, nomeDestinatario, fatura, statusAssinatura ) {
            fs.readFile( path.faturaPagaParcial, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeDestinatario || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataPagamento}}/g, fatura.dataPg);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                texto = texto.replace(/{{faturaValorRecebido}}/g, fatura.valorRecebido);
                texto = texto.replace(/{{faturaSaldoDevedor}}/g, fatura.saldoDevedor);
                texto = texto.replace(/{{faturaLink}}/g, fatura.link);

                let msgSaldo = '';
                if( fatura.valorRecebidoAnteriormente ) {
                    msgSaldo = '<strong style="display:inline;">Valor recebido anteriormente</strong>: R$ ' + fatura.valorRecebidoAnteriormente;
                }
                texto = texto.replace(/{{saldoAnterior}}/g, msgSaldo );

                let msg = '<p style="color:#3d474d;font-family:Avenir,\'Segoe UI\',Arial,sans-serif;font-size:1.1rem;font-weight:400;margin:0;margin-bottom:15px"><strong class="cor-red2" style="color:#f2182a">ATENÇÃO:</strong> Quite a fatura e evite o cancelamento do seu plano.</p>';
                if( statusAssinatura == '4' ) {
                    msg = '<p style="color:#3d474d;font-family:Avenir,\'Segoe UI\',Arial,sans-serif;font-size:1.1rem;font-weight:400;margin:0;margin-bottom:15px"><strong class="cor-red2" style="color:#f2182a">ATENÇÃO:</strong> Seu plano será desbloqueado assim que a fatura for quitada.</p>';
                } 
                texto = texto.replace(/{{msg}}/g, msg );
                
                Email.setAssunto("99Clinic - Confirmação de pagamento parcial").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }
        
        function EnviaEmailFaturaInadimplente( emailDestinatario, nomeAssinante, fatura, statusServico ) {
            fs.readFile( path.faturaInadimplente, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataEmissao}}/g, fatura.dataEmissao);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                texto = texto.replace(/{{faturaLink}}/g, fatura.link);
                texto = texto.replace(/{{statusServico}}/g, statusServico || '');
                
                Email.setAssunto("99Clinic - Aviso de fatura não paga").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailFaturaAtrasa( emailDestinatario, nomeAssinante, fatura, statusServico ) {
            fs.readFile( path.faturaAtrasa, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataEmissao}}/g, fatura.dataEmissao);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                texto = texto.replace(/{{faturaLink}}/g, fatura.link);
                texto = texto.replace(/{{statusServico}}/g, statusServico || '');
                
                Email.setAssunto("99Clinic - Aviso de fatura atrasada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailFaturaCancelada( emailDestinatario, nomeAssinante, fatura ) {
            fs.readFile( path.faturaCancelada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataEmissao}}/g, fatura.dataEmissao);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                
                Email.setAssunto("99Clinic - Aviso de fatura cancelada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        function EnviaEmailFaturaPerdoada( emailDestinatario, nomeAssinante, fatura ) {
            fs.readFile( path.faturaPerdoada, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataEmissao}}/g, fatura.dataEmissao);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                
                Email.setAssunto("99Clinic - Aviso de fatura perdoada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }

        /**
         * Mensagem genérica para ser enviada quando for difícil enviar o e-mail certo
         * exemplo: nem sempre dá para pegar facilmente os dados de pagamento feito, 
         * nesse caso é melhor enviar uma mensagem dizendo apenas que houve alteração
         * na fatura informando o novo status
         */
        function EnviaEmailFaturaStatusAlterado( emailDestinatario, nomeAssinante, fatura ) {
            fs.readFile( path.faturaStatusAlterado, 'utf-8', (err, texto)=>{
                if(err) return;

                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nomeAssinante || '');            
                texto = texto.replace(/{{faturaID}}/g, fatura.faturaID);
                texto = texto.replace(/{{faturaPeriodo}}/g, fatura.periodo);
                texto = texto.replace(/{{faturaVencimento}}/g, fatura.vencimento);
                texto = texto.replace(/{{faturaDataEmissao}}/g, fatura.dataEmissao);
                texto = texto.replace(/{{faturaValor}}/g, fatura.valorFatura);
                texto = texto.replace(/{{faturaStatus}}/g, fatura.faturaStatus);
                
                Email.setAssunto("99Clinic - Aviso de fatura alterada").setFrom(cfg.email.validacao).setTo(emailDestinatario).setHtml(texto);
                Email.enviar();
            });
        }
        
    }
    
    
    module.exports = EnviaEmail;
    EnviaEmail.EnviaEmail = new EnviaEmail();
}());