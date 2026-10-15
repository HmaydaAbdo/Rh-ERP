--
-- PostgreSQL database cluster dump
--

\restrict GSpVL0qEin0SwMUQNIdP2lU8oY9VBUZxKfAR1d0WTQQLy0NmvFrAJoiwFlTIOEJ

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE staport;
ALTER ROLE staport WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;

--
-- User Configurations
--








\unrestrict GSpVL0qEin0SwMUQNIdP2lU8oY9VBUZxKfAR1d0WTQQLy0NmvFrAJoiwFlTIOEJ

--
-- PostgreSQL database cluster dump complete
--

