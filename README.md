# Database Client Interface

Gerenciador de Banco de Dados com Construtor de Consultas Dinâmicas

## 1\. Visão Geral

Este projeto consiste em um cliente de banco de dados desktop desenvolvido com Tauri e React. A ferramenta permite conectar, visualizar estruturas de tabelas, manipular dados diretamente em uma grade interativa e construir consultas SQL complexas por meio de uma interface visual amigável ou edição puramente manual.

## 2\. Funcionalidades Principais

- **Filtros Avançados:** Sistema de filtragem em tempo real na listagem de dados com operadores lógicos clássicos e suporte ao operador `BETWEEN`.
- **Edição Inline (Double-Click):** Edição rápida e dinâmica diretamente nas células da tabela de dados ao disparar um duplo clique, preservando tipos nativos numéricos e strings.
- **Construtor de Queries (WHERE):** Painel dinâmico para seleção de colunas e inclusão estruturada de regras de filtragem sem necessidade de escrita direta de código.
- **Editor Híbrido:** Área de texto interativa que exibe a query construída visualmente, mas que aceita alterações e complementações manuais diretas antes da execução.

## 3\. Configuração do Ambiente e Execução

Garante que você possua o Node.js e a stack do Rust instalados na máquina local antes de rodar os comandos.

### Instalação de Dependências

    npm install

### Execução em Ambiente de Desenvolvimento

    npm run tauri dev

### Build de Produção

    npm run tauri build

## 4\. Integração Back-end (Tauri & Rust)

Para o funcionamento completo da persistência e das consultas brutas, certifique-se de expor as seguintes funções de comando no seu arquivo `src-tauri/src/main.rs`:

- `get_table_structure`: Retorna o array contendo o mapeamento de nome e tipo de dados das colunas.
- `execute_raw_query`: Processa a string SQL vinda do editor (dinâmico ou manual) e retorna as linhas e colunas estruturadas.
