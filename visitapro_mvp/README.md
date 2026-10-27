# VisitaPro — MVP

Aplicação web instalável para planear visitas recorrentes a clientes, com base partilhada e calendários individuais.

## Incluído neste protótipo

- Interface responsiva para computador e telemóvel.
- Painel, calendário/periodicidades e lista de clientes.
- Filtro de clientes por zona (Norte / Sul/Ilhas).
- Perfil de cliente com histórico de visitas.
- Autenticação Supabase (email/palavra-passe).
- Esquema PostgreSQL com políticas RLS para separar calendários individuais e partilhar clientes/histórico.
- Cálculo inicial das datas semanais, quinzenais e mensais.

## Requisitos

- Node.js 20 ou superior
- Conta Supabase gratuita para sincronização e contas multiutilizador

## Executar localmente

1. Instala Node.js.
2. Descompacta o projeto e abre um terminal nesta pasta.
3. Executa `npm install`.
4. Copia `.env.example` para `.env.local`.
5. Cria um projeto em https://supabase.com.
6. No Supabase, abre **SQL Editor**, cola o conteúdo de `supabase/schema.sql` e executa.
7. Em **Project Settings → API**, copia Project URL e anon/public key para `.env.local`.
8. Executa `npm run dev`.
9. Abre http://localhost:3000.

Sem credenciais Supabase, a interface abre em modo demonstração, mas os dados não são partilhados nem guardados de forma permanente.

## Publicar para PC e telemóvel

A opção mais simples é publicar o projeto na Vercel e ligar as mesmas variáveis de ambiente. Depois, abre o endereço no telemóvel e escolhe “Adicionar ao ecrã principal” / “Instalar aplicação”, conforme o navegador.

## Regras de periodicidade implementadas inicialmente

- Semanal: próxima semana ISO a partir da semana da data registada.
- Quinzenal: duas semanas ISO a partir da semana da data registada.
- Mensal: mesmo dia de calendário no mês seguinte; se esse dia não existir, usa o último dia desse mês.

## Importante antes de usar em produção

Este é um MVP inicial, não uma aplicação de produção auditada. Testa as regras de periodicidade com casos reais, confirma as políticas de acesso e configura backup. As notificações push automáticas ainda precisam de um serviço agendado e de configuração de push/web push; a interface atual indica esta limitação. Para dados reais de clientes, confirma também as regras de privacidade e as permissões necessárias na tua organização.
