import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { ConfigDiscovery } from "../services/ConfigDiscovery";
import { mergeMCPServers } from "../services/MCPMerge";
import { createVaultTools } from "../tools/vaultTools";
import { ChatMode } from "../types/constants";
import { friendlyError } from "./friendlyError";
import { getAvailableAgents } from "../store/agentSelectors";
import type { CopilotPluginContext } from "../views/CopilotChatView";
import type { CustomAgentEntry } from "../types/settings";

export type InitState = "loading" | "ready" | "error";

export interface CopilotInitialization {
  initState: InitState;
  initPromise: React.MutableRefObject<Promise<void> | null>;
  recreateSession: (overrides?: { model?: string; mode?: ChatMode }) => Promise<void>;
  discoverTools: () => Promise<void>;
}

/**
 * Owns one-time Copilot service init: SDK warmup, config discovery, the first
 * createSession call, and tool discovery. Also exposes recreateSession +
 * discoverTools so call sites can rebuild the session on mode/model/MCP
 * changes without duplicating the build-up logic.
 */
export function useCopilotInitialization(
  ctx: CopilotPluginContext | null,
): CopilotInitialization {
  const initialized = useRef(false);
  const initPromise = useRef<Promise<void> | null>(null);
  const [initState, setInitState] = useState<InitState>("loading");

  const setSessionId = useChatStore((s) => s.setSessionId);
  const setError = useChatStore((s) => s.setError);
  const setAvailableModels = useChatStore((s) => s.setAvailableModels);
  const setMCPServers = useChatStore((s) => s.setMCPServers);
  const setDiscoveredAgents = useChatStore((s) => s.setDiscoveredAgents);
  const setAvailableAgents = useChatStore((s) => s.setAvailableAgents);
  const replaceMCPTools = useChatStore((s) => s.replaceMCPTools);

  const discoverTools = useCallback(async () => {
    if (!ctx) return;
    // The CLI's tools.list RPC only returns builtins; MCP tools surface
    // through tool.execution_start events. We list builtins for completeness.
    try {
      const tools = await ctx.copilotService.listTools();
      if (tools.length > 0) {
        replaceMCPTools(tools);
      }
    } catch {
      // Non-fatal: tools just won't show in the picker.
    }
  }, [ctx, replaceMCPTools]);

  const recreateSession = useCallback(
    async (overrides: { model?: string; mode?: ChatMode } = {}) => {
      if (!ctx) return;
      if (initPromise.current) await initPromise.current;

      const state = useChatStore.getState();
      const model = overrides.model ?? state.currentModel;
      const mode = overrides.mode ?? state.currentMode;
      const tools = mode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;

      await ctx.copilotService.createSession({
        model,
        mode,
        tools,
        mcpServers: state.getEnabledMCPConfig(),
      });
      setSessionId(ctx.copilotService.getSessionId());
      await discoverTools();
    },
    [ctx, discoverTools, setSessionId],
  );

  useEffect(() => {
    if (!ctx || initialized.current) return;
    initialized.current = true;

    const initService = async () => {
      try {
        setInitState("loading");
        await ctx.copilotService.initialize();

        try {
          const models = await ctx.copilotService.getAvailableModels();
          if (models.length > 0) {
            setAvailableModels(models);
          }
        } catch {
          // Non-fatal: fall back to static model list
        }

        const initialMCPServers = mergeMCPServers(
          ctx.settings.mcpServers,
          [],
          useChatStore.getState().mcpServers,
        );
        setMCPServers(initialMCPServers);
        let sessionMCPConfig = useChatStore.getState().getEnabledMCPConfig();

        try {
          const discovery = new ConfigDiscovery(ctx.app);
          const config = await discovery.discover();
          if (config.agents.length > 0) {
            setDiscoveredAgents(config.agents);
          }

          const discoveredMCPServers = ctx.settings.inheritConfig ? config.mcpServers : [];
          const mergedMCPServers = mergeMCPServers(
            ctx.settings.mcpServers,
            discoveredMCPServers,
            useChatStore.getState().mcpServers,
          );
          setMCPServers(mergedMCPServers);
          sessionMCPConfig = useChatStore.getState().getEnabledMCPConfig();
        } catch {
          // Non-fatal: continue without discovered agents or MCP servers
        }

        const tools =
          ctx.settings.defaultMode === ChatMode.Agent
            ? createVaultTools(ctx.app)
            : undefined;

        // Redact secrets before logging
        const redactedMCPConfig = Object.fromEntries(
          Object.entries(sessionMCPConfig).map(([name, cfg]: [string, any]) => [
            name,
            {
              ...cfg,
              ...(cfg.headers
                ? { headers: Object.fromEntries(Object.keys(cfg.headers).map((k) => [k, "<redacted>"])) }
                : {}),
              ...(cfg.env && Object.keys(cfg.env).length > 0
                ? { env: Object.fromEntries(Object.keys(cfg.env).map((k) => [k, "<redacted>"])) }
                : {}),
            },
          ]),
        );
        // eslint-disable-next-line no-console
        console.log("[copilot-obsidian] init: MCP servers configured:", Object.keys(redactedMCPConfig));
        // eslint-disable-next-line no-console
        console.debug("[copilot-obsidian] init: mcpConfig (redacted):", redactedMCPConfig);

        await ctx.copilotService.createSession({
          model: ctx.settings.defaultModel,
          mode: ctx.settings.defaultMode,
          tools,
          mcpServers: sessionMCPConfig,
        });
        setSessionId(ctx.copilotService.getSessionId());
        // Kick off tool discovery in the background; safe to not await.
        discoverTools();
        setInitState("ready");
      } catch (err: any) {
        setInitState("error");
        setError(friendlyError(err.message));
      }
    };

    initPromise.current = initService();
  }, [
    ctx,
    discoverTools,
    setAvailableModels,
    setDiscoveredAgents,
    setError,
    setMCPServers,
    setSessionId,
  ]);

  // Keep availableAgents in sync with settings + discovery so setAgent's
  // validation accepts agents from either source.
  const settingsAgents = ctx?.settings?.customAgents as CustomAgentEntry[] | undefined;
  const discoveredAgents = useChatStore((s) => s.discoveredAgents);
  useEffect(() => {
    setAvailableAgents(getAvailableAgents(settingsAgents, discoveredAgents));
  }, [settingsAgents, discoveredAgents, setAvailableAgents]);

  return { initState, initPromise, recreateSession, discoverTools };
}
