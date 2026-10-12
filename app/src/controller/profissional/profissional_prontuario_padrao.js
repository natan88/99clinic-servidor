;(function () {
    "use strict";

    /**
     * Cria as seções de prontuário padrão para um profissional recém cadastrado
     * Como há várias seções e o profissional pode ser cadastrado em mais de um local
     * foi criado esse arquivo para centralizar a criação dessas seções
     */
    

    const Promise = require("promise"),
        prontuario = require('src/controller/prontuario/prontuario');
    
    let instance = null;

    function MedicoProntuariosIniciais() {
        const self = this;

        self.criaProntuariosPadrao = criaProntuariosPadrao;

        

        function criaProntuariosPadrao (empresaID, user) {
            return new Promise( function ( resolve, reject){
    
                const Prontuario = new prontuario( empresaID, user );

                const anamnese = {
                    nome: 'Anamnese',
                    ordem: 1,
                    campos: [
                        {
                            tipo: 'textarea',
                            nome: 'Atendimento',
                            ordem: 1
                        }
                    ]
                };

                const receita = {
                    nome: 'Receita',
                    ordem: 2,
                    campos: [
                        {
                            tipo: 'textarea',
                            nome: 'Descrição',
                            ordem: 1
                        }
                    ]
                };

                const atestado = {
                    nome: 'Atestado',
                    ordem: 3,
                    campos: [
                        {
                            tipo: 'textarea',
                            nome: 'Descrição do atestado',
                            ordem: 1
                        },
                        {
                            tipo: 'radio',
                            nome: 'Tipo',
                            ordem: 2,
                            conf: {"options": [{"value": "Atestado", "checked": false}, {"value": "Comparecimento", "checked": false}], "orientation": "horizontal"}
                        }
                    ]
                };

                const laudo = {
                    nome: 'Laudo',
                    ordem: 4,
                    campos: [
                        {
                            tipo: 'textarea',
                            nome: 'Descrição',
                            ordem: 1
                        }
                    ]
                };

                const oftalmologia = {
                    nome: 'Oftalmologia',
                    ordem: 5,
                    campos: [
                        {
                            tipo: 'po',
                            nome: 'Prescrição de óculos',
                            ordem: 1
                        }
                    ]
                };

                const pressaoArterial= {
                    nome: 'Pressão arterial',
                    ordem: 6,
                    campos: [
                        {
                            tipo: 'pa',
                            nome: 'Pressão arterial',
                            ordem: 1
                        },
                        {
                            tipo: 'textarea',
                            nome: 'Observação',
                            ordem: 2
                        }
                    ]
                };

                const dadosImportantes= {
                    nome: 'Dados importantes',
                    ordem: 7,
                    campos: [
                        {
                            tipo: 'number',
                            nome: 'Peso',
                            ordem: 1,
                            conf: {"casas": 2, "unidade": "kg"}
                        },
                        {
                            tipo: 'number',
                            nome: 'Altura',
                            ordem: 2,
                            conf: {"casas": 2, "unidade": "m"}
                        },
                        {
                            tipo: 'number',
                            nome: 'Circunferência abdominal',
                            ordem: 3,
                            conf: {"casas": 2, "unidade": "m"}
                        },
                        {
                            tipo: 'radio',
                            nome: 'Tipo sanguíneo',
                            ordem: 4,
                            conf: {"options": [{"value": "B+", "checked": false}, {"value": "B-", "checked": false}, {"value": "AB+", "checked": false}, {"value": "AB-", "checked": false}, {"value": "O+", "checked": false}, {"value": "O-", "checked": false}], "orientation": "horizontal"}
                        },
                        {
                            tipo: 'radio',
                            nome: 'Tem filhos',
                            ordem: 5,
                            conf: {"options": [{"value": "Sim", "checked": false}, {"value": "Não", "checked": false}], "orientation": "horizontal"}
                        },
                        {
                            tipo: 'checkbox',
                            nome: 'Patologia',
                            ordem: 6,
                            conf: {"options": [{"value": "Hipertenso", "checked": false}, {"value": "Diabético", "checked": false}, {"value": "Rinite", "checked": false}, {"value": "Alergia alimentar", "checked": false}, {"value": "Eczema de contato", "checked": false}, {"value": "Urticária", "checked": false}, {"value": "Outras", "checked": false}], "orientation": "vertical"}
                        },
                    ]
                };

                const exame = {
                    nome: 'Exame',
                    ordem: 8,
                    campos: [
                        {
                            tipo: 'textarea',
                            nome: 'Solicitação de exames',
                            ordem: 1
                        }
                    ]
                };

                Prontuario.add(anamnese).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(receita).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(atestado).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(laudo).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(oftalmologia).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(pressaoArterial).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(dadosImportantes).then( secaoID => { }).catch( erro => { } );
                Prontuario.add(exame).then( secaoID => { }).catch( erro => { } );

            });
        }//add

        
    }
    
    if(instance === null) instance = new MedicoProntuariosIniciais();
    module.exports = MedicoProntuariosIniciais;
    MedicoProntuariosIniciais.MedicoProntuariosIniciais = instance;
}());