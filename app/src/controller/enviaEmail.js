;(function () {
    "use strict";

    const fs = require("fs"),
        Email = require("src/util/email.js").Email,
        moment = require('moment'),
        cfg = require("src/util/config.js"),

        path = {
            cadastro: require.resolve('src/email/cadastro-empresa.html'),
            ativaCadastro: require.resolve('src/email/ativar-cadastro-empresa.html'),
            cadastroAprovado: require.resolve('src/email/cadastro-empresa-aprovado.html'),
            recuperarSenha: require.resolve('src/email/recuperar-senha.html'),
            acaoSenhaUsuario: require.resolve('src/email/usuario-link-senha.html'),
            senhaUserAlterada: require.resolve('src/email/usuario-senha-alterada.html'),
            senhaUserAlteradaPorAdmin: require.resolve('src/email/usuario-senha-alterada-admin.html'),
            usuarioAlterado: require.resolve('src/email/usuario-dados-alterados.html'),
            usuarioCadastrado: require.resolve('src/email/usuario-cadastrado.html'),
        };
        
    
    
    function EnviaEmail() {
        const self = this;

        self.EnviaEmailRecuperacaoSenha = EnviaEmailRecuperacaoSenha;
        self.CadastroEmpresa = CadastroEmpresa;
        self.LinkAtivacaoEmpresa = LinkAtivacaoEmpresa;
        self.EmpresaAprovado = EmpresaAprovado;
        self.LinkRedefinirSenha = LinkRedefinirSenha;
        self.usuarioSenhaAlterada = usuarioSenhaAlterada;
        self.usuarioSenhaAlteradaPorAdmin = usuarioSenhaAlteradaPorAdmin;
        self.usuarioDadosAlterados = usuarioDadosAlterados;
        self.usuarioCadastrado = usuarioCadastrado;
        self.AvisoInterno = AvisoInterno;
        
        /*
         * Envia e-mail de recuperação de senha do usuário
         */
        function EnviaEmailRecuperacaoSenha(token, tokenEmail, email, nome) {
            fs.readFile( path.recuperarSenha, 'utf-8', function(err, texto){
                if(err) return;
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, nome || '');
                texto = texto.replace(/{{token}}/g, token);
                texto = texto.replace(/{{check}}/g, tokenEmail);
                
                Email.setAssunto("99Clinic- Recuperar senha").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }
        
        
        /*
         * quando o cadastro da empresa é realizado
         */
        function CadastroEmpresa(email, empresaNome, usuarioNome, token, idEmpresa) {
            fs.readFile( path.cadastro, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome || '');
                texto = texto.replace(/{{token}}/g, token);
                
                Email.setAssunto("99Clinic- Cadastro realizado").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
            
            // envia e-mail para a ADM
            let date = moment(new Date()).format('DD/MM/YYYY HH:mm');
            let txtAdm = `<p>Nova empresa Cadastrada<br>
            <strong>ID:</strong> ${idEmpresa} <br>
            <strong>Nome:</strong> ${empresaNome} <br>
            <strong>E-mail:</strong> ${email} <br>
            <strong>Data:</strong> ${date}
            </p>`;
            
            Email.setAssunto("99Clinic - Cadastro realizado").setFrom(cfg.email.validacao).setTo('sis.99clinic@gmail.com').setHtml(txtAdm);
            Email.enviar();
        }
        
        /*
         * Envia o link de ativação da empresa. Quando o cliente solicita um 
         * link adicional, normalmente quando o e-mail enviado por self.CadastroEmpresa
         * não chega
         */
        function LinkAtivacaoEmpresa(email, nome, token) {
            fs.readFile( path.ativaCadastro, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{empresaNome}}/g, nome);
                texto = texto.replace(/{{token}}/g, token);
                
                Email.setAssunto("99Clinic - Ativação de cadastro").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }
        
        function EmpresaAprovado(email, empresaNome, usuarioNome) {
            fs.readFile( path.cadastroAprovado, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome);

                Email.setAssunto("99Clinic - Cadastro aprovado").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }
        
        /**
         * O administrador da empresa envia o link para o usuário redefinir sua senha
         * O processo é igual ao usado pelo proprio usuário para recuperar a senha, só
         * muda a mensagem enviada ao e-mail
         */
        function LinkRedefinirSenha(email, usuarioNome, usuarioPerfil, empresaNome, token,tokenID) {
            fs.readFile( path.acaoSenhaUsuario, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{token}}/g, token);
                texto = texto.replace(/{{check}}/g, tokenID);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome);
                texto = texto.replace(/{{usuarioPerfil}}/g, usuarioPerfil);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                
                Email.setAssunto("99Clinic - Redefinir senha").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }

        /**
         * Informativo sobre senha de um usuário alterada pelo próprio usuário
         */
        function usuarioSenhaAlterada(email, usuarioNome, usuarioPerfil, empresaNome) {
            fs.readFile( path.senhaUserAlterada, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome);
                texto = texto.replace(/{{usuarioPerfil}}/g, usuarioPerfil);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                
                Email.setAssunto("99Clinic - Senha alterada").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }

        /**
         * Informativo sobre senha de um usuário alterada pelo administrador
         */
        function usuarioSenhaAlteradaPorAdmin(email, usuarioNome, usuarioPerfil, empresaNome, novaSenha) {
            fs.readFile( path.senhaUserAlteradaPorAdmin, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNovaSenha}}/g, novaSenha);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome);
                texto = texto.replace(/{{usuarioPerfil}}/g, usuarioPerfil);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                
                Email.setAssunto("99Clinic - Senha alterada").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }

        function usuarioDadosAlterados(email, usuarioNome, usuarioPerfil, empresaNome, autorAlteracao, emailAlterado) {
            fs.readFile( path.usuarioAlterado, 'utf-8', function(err, texto){
                if(err) return;
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome);
                texto = texto.replace(/{{usuarioPerfil}}/g, usuarioPerfil);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                texto = texto.replace(/{{alteracaoAutor}}/g, autorAlteracao);
                if( emailAlterado ) {
                    let msg = `<p style="color:#3d474d;font-family:Avenir,'Segoe UI',Arial,sans-serif;font-size:1.1rem;font-weight:400;margin:0;margin-top:15px;"><strong style="color:#ff3300d2">ATENÇÃO:</strong> o seu login mudou. Para acessar o 99clinic use o e-mail: ${email}</p>`;
                    texto = texto.replace(/{{msg}}/g, msg);
                } else {
                    texto = texto.replace(/{{msg}}/g, '');
                }
                
                Email.setAssunto("99Clinic - Dados alterados").setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }

        /**
         * Assim que um usuário é cadastrado recebe esse e-mail
         * 
         * Se for gerado uma senha aleatória para o usuário, enviar no corpo do e-mail,
         * se não tiver sido gerada, enviar link para o usuário criar sua senha
         */
        function usuarioCadastrado(email, usuarioNome, usuarioPerfil, empresaNome, token, tokenID, senha) {
            fs.readFile( path.usuarioCadastrado, 'utf-8', function(err, texto){
                if(err) return;

                if( !senha ) {
                    senha = `<a href="${cfg.url_site}/redefinir-senha?token=${token}&amp;check=${tokenID}&action=criar" target="_blank">criar senha</a>`;
                }
                
                texto = texto.replace(/{{urlAPP}}/g, cfg.url_site);
                texto = texto.replace(/{{usuarioNome}}/g, usuarioNome);
                texto = texto.replace(/{{usuarioPerfil}}/g, usuarioPerfil);
                texto = texto.replace(/{{empresaNome}}/g, empresaNome);
                texto = texto.replace(/{{usuarioEmail}}/g, email);
                texto = texto.replace(/{{usuarioSenha}}/g, senha);
                
                Email.setAssunto(`99Clinic - Você foi cadastrado na ${empresaNome}`).setFrom(cfg.email.validacao).setTo(email).setHtml(texto);
                Email.enviar();
            });
        }

        /**
         * Envio de mensagens internas, para a própria equipe do 99Clinic
         * Exemplo de uso: 
         * - avisar que a empresa tem intenção de comprar
         * - pedido de suporte
         * 
         */
        function AvisoInterno( assunto, mensagem ) {
            let date = moment.utc();
            date = date.format('DD/MM/YYYY HH:mm');
            const texto = `<strong>Data:</strong> ${date}<br>
            <strong>Mensagem:</strong><br><br>
            ${mensagem}`;

            Email.setAssunto(`${assunto} - 99Clinic`).setFrom(cfg.email.validacao).setTo('sis.99clinic@gmail.com').setHtml(texto);
            Email.enviar();
        }
    }
    
    
    module.exports = EnviaEmail;
    EnviaEmail.EnviaEmail = new EnviaEmail();
}());