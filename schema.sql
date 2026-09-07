-- Schema for PostgreSQL Database
-- This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.etf_holdings (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  etf_ticker text NOT NULL,
  holding_ticker text NOT NULL,
  holding_name text NOT NULL,
  sector text,
  country text,
  currency text,
  weight numeric NOT NULL,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT etf_holdings_pkey PRIMARY KEY (id)
);
