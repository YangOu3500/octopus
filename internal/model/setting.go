package model

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

type SettingKey string

const (
	SettingKeyProxyURL                   SettingKey = "proxy_url"
	SettingKeyStatsSaveInterval          SettingKey = "stats_save_interval"                  // 将统计信息写入数据库的周期(分钟)
	SettingKeyModelInfoUpdateInterval    SettingKey = "model_info_update_interval"           // 模型信息更新间隔(小时)
	SettingKeySyncLLMInterval            SettingKey = "sync_llm_interval"                    // LLM 同步间隔(小时)
	SettingKeySiteSyncInterval           SettingKey = "site_sync_interval"                   // 站点账号同步间隔(小时)
	SettingKeySiteCheckinInterval        SettingKey = "site_checkin_interval"                // 站点自动签到间隔(小时)
	SettingKeyRelayLogKeepPeriod         SettingKey = "relay_log_keep_period"                // 日志保存时间范围(天)
	SettingKeyRelayLogKeepEnabled        SettingKey = "relay_log_keep_enabled"               // 是否保留历史日志
	SettingKeyCORSAllowOrigins           SettingKey = "cors_allow_origins"                   // 跨域白名单(逗号分隔, 如 "example.com,example2.com"). 为空不允许跨域, "*"允许所有
	SettingKeyCircuitBreakerThreshold    SettingKey = "circuit_breaker_threshold"            // 熔断触发阈值（连续失败次数）
	SettingKeyCircuitBreakerCooldown     SettingKey = "circuit_breaker_cooldown"             // 熔断基础冷却时间（秒）
	SettingKeyCircuitBreakerMaxCooldown  SettingKey = "circuit_breaker_max_cooldown"         // 熔断最大冷却时间（秒），指数退避上限
	SettingKeyRelayWSUpgradeEnabled      SettingKey = "relay_ws_upgrade_enabled"             // 是否主动尝试WS上游连接（双向降级）
	SettingKeySSEHeartbeatInterval       SettingKey = "sse_heartbeat_interval"               // SSE 流式心跳间隔（秒），0 表示禁用
	SettingKeySSEPreStreamHeartbeatDelay SettingKey = "sse_pre_stream_heartbeat_delay"       // SSE 上游流建立前心跳首次延迟（秒），0 表示禁用
	SettingKeyStreamFirstValidTimeout    SettingKey = "stream_first_valid_timeout_seconds"   // 流式首个有效输出全局超时（秒），0 表示禁用
	SettingKeyStreamFirstValidMaxBuffer  SettingKey = "stream_first_valid_max_buffer_bytes"  // 流式首个有效输出前最大缓冲字节数
	SettingKeyStreamEmptyDoneAsFailure   SettingKey = "stream_empty_done_as_failure"         // 流式仅 [DONE] 是否判定为失败
	SettingKeyStreamInvalidSSEAsFailure  SettingKey = "stream_invalid_sse_as_failure"        // 流式无效 SSE 是否判定为失败
	SettingKeyGroupHealthEnabled         SettingKey = "group_health_enabled"                 // 是否启用分组健康检查功能
	SettingKeyHealthScoreEnabled         SettingKey = "enable_health_score"                  // 是否启用真实请求反馈驱动的健康分与冷却调度
	SettingKeyHealthScoreWindowMinutes   SettingKey = "health_score_window_minutes"          // 健康分统计窗口（分钟）
	SettingKeyHealthMinConfidentSample   SettingKey = "health_min_confident_sample"          // 健康分最低可信样本量
	SettingKeySuccessRatePenaltyWeight   SettingKey = "success_rate_penalty_weight"          // 失败率惩罚权重
	SettingKeyEmptyResponsePenaltyWeight SettingKey = "empty_response_penalty_weight"        // 空响应惩罚权重
	SettingKeyLatencyPenaltyWeight       SettingKey = "latency_penalty_weight"               // 延迟惩罚权重
	SettingKeyChannelConcurrencyEnabled  SettingKey = "channel_concurrency_enabled"          // 是否启用 channel+model 硬并发限制
	SettingKeyChannelConcurrencyMode     SettingKey = "channel_concurrency_mode"             // channel+model 并发后端：local/database
	SettingKeyChannelConcurrencyMax      SettingKey = "channel_concurrency_max_in_flight"    // 单 channel+model 最大在途请求数
	SettingKeyChannelConcurrencyQueueMS  SettingKey = "channel_concurrency_queue_timeout_ms" // 单 channel+model 排队等待上限（毫秒）
	SettingKeyChannelConcurrencyLeaseMS  SettingKey = "channel_concurrency_lease_ttl_ms"     // database 模式 lease TTL（毫秒）
	SettingKeyProbeEnabled               SettingKey = "probe.enabled"                        // 是否启用慢速主动探测
	SettingKeyProbeSiteMinInterval       SettingKey = "probe.site_min_interval_minutes"      // 同一站点最小探测间隔（分钟）
	SettingKeyProbeModelMinInterval      SettingKey = "probe.model_min_interval_hours"       // 同一站点同一模型最小探测间隔（小时）
	SettingKeyProbeMaxConcurrency        SettingKey = "probe.max_concurrency"                // 慢速探测最大并发
	SettingKeyProbeDailyMaxRequests      SettingKey = "probe.daily_max_requests_per_site"    // 每站点每日最大探测请求数
	SettingKeyProbePrompt                SettingKey = "probe.prompt"                         // 慢速探测提示词
	SettingKeyProbeMaxTokens             SettingKey = "probe.max_tokens"                     // 慢速探测最大输出 token
	SettingKeyProbeTemperature           SettingKey = "probe.temperature"                    // 慢速探测温度
	SettingKeyProbeJitterRatio           SettingKey = "probe.jitter_ratio"                   // 慢速探测抖动比例
	SettingKeyProbeStreamEnabled         SettingKey = "probe.stream_enabled"                 // 慢速探测是否使用流式请求
	SettingKeyGroupAutoGenerateAssociationMode    SettingKey = "group_auto_generate_association_mode"    // 模型分组批量生成默认关联模式
	SettingKeyGroupAutoGenerateAssociationOptions SettingKey = "group_auto_generate_association_options" // 模型分组批量生成默认关联规则 JSON
	SettingKeyGroupAutoGenerateManualAliases      SettingKey = "group_auto_generate_manual_aliases"      // 模型分组批量生成默认手动映射 JSON
	SettingKeyJWTSecret                  SettingKey = "jwt_secret"                           // JWT 签名密钥（自动生成）
	SettingKeyStatsSiteModelBackfilled   SettingKey = "stats_site_model_backfilled"          // 站点渠道小时聚合是否已回填历史日志
)

type Setting struct {
	Key   SettingKey `json:"key" gorm:"primaryKey"`
	Value string     `json:"value" gorm:"not null"`
}

func DefaultSettings() []Setting {
	return []Setting{
		{Key: SettingKeyProxyURL, Value: ""},
		{Key: SettingKeyStatsSaveInterval, Value: "10"},          // 默认10分钟保存一次统计信息
		{Key: SettingKeyCORSAllowOrigins, Value: ""},             // CORS 默认不允许跨域，设置为 "*" 才允许所有来源
		{Key: SettingKeyModelInfoUpdateInterval, Value: "24"},    // 默认24小时更新一次模型信息
		{Key: SettingKeySyncLLMInterval, Value: "24"},            // 默认24小时同步一次LLM
		{Key: SettingKeySiteSyncInterval, Value: "12"},           // 默认12小时同步一次站点账号信息
		{Key: SettingKeySiteCheckinInterval, Value: "24"},        // 默认24小时自动签到一次
		{Key: SettingKeyRelayLogKeepPeriod, Value: "7"},          // 默认日志保存7天
		{Key: SettingKeyRelayLogKeepEnabled, Value: "true"},      // 默认保留历史日志
		{Key: SettingKeyCircuitBreakerThreshold, Value: "5"},     // 默认连续失败5次触发熔断
		{Key: SettingKeyCircuitBreakerCooldown, Value: "60"},     // 默认基础冷却60秒
		{Key: SettingKeyCircuitBreakerMaxCooldown, Value: "600"}, // 默认最大冷却600秒（10分钟）
		{Key: SettingKeyRelayWSUpgradeEnabled, Value: "false"},   // 默认关闭主动WS上游升级
		{Key: SettingKeySSEHeartbeatInterval, Value: "0"},        // 默认禁用 SSE 流式心跳
		{Key: SettingKeySSEPreStreamHeartbeatDelay, Value: "0"},  // 默认禁用 SSE 上游流建立前心跳
		{Key: SettingKeyStreamFirstValidTimeout, Value: "15"},
		{Key: SettingKeyStreamFirstValidMaxBuffer, Value: "65536"},
		{Key: SettingKeyStreamEmptyDoneAsFailure, Value: "true"},
		{Key: SettingKeyStreamInvalidSSEAsFailure, Value: "true"},
		{Key: SettingKeyGroupHealthEnabled, Value: "false"}, // 默认不显示/运行分组健康检查，避免打扰主界面
		{Key: SettingKeyHealthScoreEnabled, Value: "false"}, // 默认关闭，避免升级后改变既有路由行为
		{Key: SettingKeyHealthScoreWindowMinutes, Value: "60"},
		{Key: SettingKeyHealthMinConfidentSample, Value: "10"},
		{Key: SettingKeySuccessRatePenaltyWeight, Value: "70"},
		{Key: SettingKeyEmptyResponsePenaltyWeight, Value: "25"},
		{Key: SettingKeyLatencyPenaltyWeight, Value: "8"},
		{Key: SettingKeyChannelConcurrencyEnabled, Value: "false"},
		{Key: SettingKeyChannelConcurrencyMode, Value: "local"},
		{Key: SettingKeyChannelConcurrencyMax, Value: "1"},
		{Key: SettingKeyChannelConcurrencyQueueMS, Value: "1000"},
		{Key: SettingKeyChannelConcurrencyLeaseMS, Value: "120000"},
		{Key: SettingKeyProbeEnabled, Value: "false"},
		{Key: SettingKeyProbeSiteMinInterval, Value: "30"},
		{Key: SettingKeyProbeModelMinInterval, Value: "12"},
		{Key: SettingKeyProbeMaxConcurrency, Value: "1"},
		{Key: SettingKeyProbeDailyMaxRequests, Value: "20"},
		{Key: SettingKeyProbePrompt, Value: "只回复 OK"},
		{Key: SettingKeyProbeMaxTokens, Value: "8"},
		{Key: SettingKeyProbeTemperature, Value: "0"},
		{Key: SettingKeyProbeJitterRatio, Value: "0.25"},
		{Key: SettingKeyProbeStreamEnabled, Value: "false"},
		{Key: SettingKeyGroupAutoGenerateAssociationMode, Value: string(GroupAutoGenerateAssociationExact)},
		{Key: SettingKeyGroupAutoGenerateAssociationOptions, Value: "{}"},
		{Key: SettingKeyGroupAutoGenerateManualAliases, Value: "[]"},
		{Key: SettingKeyJWTSecret, Value: ""}, // 为空时自动生成
		{Key: SettingKeyStatsSiteModelBackfilled, Value: "false"},
	}
}

func (s *Setting) Validate() error {
	switch s.Key {
	case SettingKeyModelInfoUpdateInterval, SettingKeySyncLLMInterval, SettingKeySiteSyncInterval,
		SettingKeySiteCheckinInterval, SettingKeyRelayLogKeepPeriod,
		SettingKeyCircuitBreakerThreshold, SettingKeyCircuitBreakerCooldown, SettingKeyCircuitBreakerMaxCooldown,
		SettingKeyHealthScoreWindowMinutes, SettingKeyHealthMinConfidentSample,
		SettingKeySuccessRatePenaltyWeight, SettingKeyEmptyResponsePenaltyWeight, SettingKeyLatencyPenaltyWeight:
		_, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		return nil
	case SettingKeyChannelConcurrencyMax:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value <= 0 {
			return fmt.Errorf("setting value must be greater than 0")
		}
		return nil
	case SettingKeyChannelConcurrencyQueueMS:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value < 0 {
			return fmt.Errorf("setting value must be non-negative")
		}
		return nil
	case SettingKeyChannelConcurrencyLeaseMS:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value <= 0 {
			return fmt.Errorf("setting value must be greater than 0")
		}
		return nil
	case SettingKeyChannelConcurrencyMode:
		switch strings.ToLower(strings.TrimSpace(s.Value)) {
		case "local", "database":
			return nil
		default:
			return fmt.Errorf("setting value must be local or database")
		}
	case SettingKeyProbeSiteMinInterval, SettingKeyProbeModelMinInterval:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value <= 0 {
			return fmt.Errorf("setting value must be greater than 0")
		}
		return nil
	case SettingKeyProbeMaxConcurrency, SettingKeyProbeDailyMaxRequests, SettingKeyProbeMaxTokens:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value <= 0 {
			return fmt.Errorf("setting value must be greater than 0")
		}
		return nil
	case SettingKeyProbeTemperature:
		value, err := strconv.ParseFloat(s.Value, 64)
		if err != nil {
			return fmt.Errorf("setting value must be a number")
		}
		if value < 0 || value > 2 {
			return fmt.Errorf("setting value must be between 0 and 2")
		}
		return nil
	case SettingKeyProbeJitterRatio:
		value, err := strconv.ParseFloat(s.Value, 64)
		if err != nil {
			return fmt.Errorf("setting value must be a number")
		}
		if value < 0 || value > 1 {
			return fmt.Errorf("setting value must be between 0 and 1")
		}
		return nil
	case SettingKeySSEHeartbeatInterval, SettingKeySSEPreStreamHeartbeatDelay, SettingKeyStreamFirstValidTimeout:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value < 0 {
			return fmt.Errorf("setting value must be non-negative")
		}
		return nil
	case SettingKeyStreamFirstValidMaxBuffer:
		value, err := strconv.Atoi(s.Value)
		if err != nil {
			return fmt.Errorf("setting value must be an integer")
		}
		if value <= 0 {
			return fmt.Errorf("setting value must be greater than 0")
		}
		return nil
	case SettingKeyRelayLogKeepEnabled, SettingKeyRelayWSUpgradeEnabled, SettingKeyStreamEmptyDoneAsFailure, SettingKeyStreamInvalidSSEAsFailure, SettingKeyGroupHealthEnabled, SettingKeyHealthScoreEnabled, SettingKeyChannelConcurrencyEnabled, SettingKeyProbeEnabled, SettingKeyProbeStreamEnabled:
		if s.Value != "true" && s.Value != "false" {
			return fmt.Errorf("setting value must be true or false")
		}
		return nil
	case SettingKeyProbePrompt:
		if strings.TrimSpace(s.Value) == "" {
			return fmt.Errorf("setting value must not be empty")
		}
		return nil
	case SettingKeyGroupAutoGenerateAssociationMode:
		switch GroupAutoGenerateAssociationMode(strings.ToLower(strings.TrimSpace(s.Value))) {
		case GroupAutoGenerateAssociationExact, GroupAutoGenerateAssociationAlias:
			return nil
		default:
			return fmt.Errorf("setting value must be exact or alias")
		}
	case SettingKeyGroupAutoGenerateAssociationOptions:
		if strings.TrimSpace(s.Value) == "" {
			return nil
		}
		var options GroupAutoGenerateAssociationOptions
		if err := json.Unmarshal([]byte(s.Value), &options); err != nil {
			return fmt.Errorf("setting value must be valid JSON object")
		}
		return nil
	case SettingKeyGroupAutoGenerateManualAliases:
		if strings.TrimSpace(s.Value) == "" {
			return nil
		}
		var aliases []GroupAutoGenerateManualAlias
		if err := json.Unmarshal([]byte(s.Value), &aliases); err != nil {
			return fmt.Errorf("setting value must be valid JSON array")
		}
		if len(aliases) > 200 {
			return fmt.Errorf("setting value must contain at most 200 manual aliases")
		}
		for _, alias := range aliases {
			if strings.TrimSpace(alias.Alias) == "" || strings.TrimSpace(alias.Target) == "" {
				return fmt.Errorf("manual alias entries must include alias and target")
			}
		}
		return nil
	case SettingKeyProxyURL:
		if s.Value == "" {
			return nil
		}
		parsedURL, err := url.Parse(s.Value)
		if err != nil {
			return fmt.Errorf("proxy URL is invalid: %w", err)
		}
		validSchemes := map[string]bool{
			"http":   true,
			"https":  true,
			"socks5": true,
		}
		if !validSchemes[parsedURL.Scheme] {
			return fmt.Errorf("proxy URL scheme must be http, https, socks, or socks5")
		}
		if parsedURL.Host == "" {
			return fmt.Errorf("proxy URL must have a host")
		}
		return nil
	}

	return nil
}
