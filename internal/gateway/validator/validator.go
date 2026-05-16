package validator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
)

type Provider string

const (
	ProviderOpenAIChat      Provider = "openai_chat"
	ProviderOpenAIResponses Provider = "openai_responses"
	ProviderAnthropic       Provider = "anthropic"
	ProviderGemini          Provider = "gemini"
)

type ValidationStatus string

const (
	ValidationOK       ValidationStatus = "ok"
	ValidationRetry    ValidationStatus = "retry"
	ValidationTerminal ValidationStatus = "terminal"
)

const (
	ReasonNetworkTimeout       = "network_timeout"
	ReasonNetworkError         = "network_error"
	ReasonRateLimit            = "rate_limit"
	ReasonServerError          = "server_error"
	ReasonEmptyBody            = "empty_body"
	ReasonInvalidJSON          = "invalid_json"
	ReasonHTMLOrLoginPage      = "html_or_login_page"
	ReasonCloudflarePage       = "cloudflare_page"
	ReasonUpstreamErrorJSON    = "upstream_error_json"
	ReasonMissingChoices       = "missing_choices"
	ReasonEmptyChoices         = "empty_choices"
	ReasonEmptyContent         = "empty_content"
	ReasonZeroCompletionTokens = "zero_completion_tokens"
	ReasonEmptyOutput          = "empty_output"
	ReasonNoValidOutput        = "no_valid_output"
	ReasonZeroOutputTokens     = "zero_output_tokens"
	ReasonStopWithoutContent   = "stop_without_content"
	ReasonEmptyCandidates      = "empty_candidates"
	ReasonCandidateWithoutPart = "candidate_without_parts"
	ReasonNoValidCandidate     = "no_valid_candidate"
	ReasonBlockedNoValidReply  = "blocked_no_valid_reply"
)

type Response struct {
	StatusCode int
	Header     http.Header
	Body       []byte
	Err        error
}

type ValidationResult struct {
	Status    ValidationStatus
	Reason    string
	Detail    string
	Retryable bool
}

func ValidateNonStream(provider Provider, response Response) ValidationResult {
	if result, ok := validateTransport(response.Err); ok {
		return result
	}
	if result, ok := validateCommonResponse(response); ok {
		return result
	}

	switch provider {
	case ProviderOpenAIChat:
		return validateOpenAIChat(response)
	case ProviderOpenAIResponses:
		return validateOpenAIResponses(response)
	case ProviderAnthropic:
		return validateAnthropic(response)
	case ProviderGemini:
		return validateGemini(response)
	default:
		return ValidationResult{
			Status:    ValidationTerminal,
			Reason:    "unsupported_provider",
			Detail:    fmt.Sprintf("provider=%s", provider),
			Retryable: false,
		}
	}
}

func validateTransport(err error) (ValidationResult, bool) {
	if err == nil {
		return ValidationResult{}, false
	}
	if isTimeoutError(err) {
		return retryResult(ReasonNetworkTimeout, "transport=timeout"), true
	}
	return retryResult(ReasonNetworkError, "transport=error"), true
}

func validateCommonResponse(response Response) (ValidationResult, bool) {
	if response.StatusCode == http.StatusTooManyRequests {
		return retryResult(ReasonRateLimit, responseDetail(response)), true
	}
	if response.StatusCode >= http.StatusInternalServerError {
		return retryResult(ReasonServerError, responseDetail(response)), true
	}

	body := bytes.TrimSpace(response.Body)
	if len(body) == 0 {
		return retryResult(ReasonEmptyBody, responseDetail(response)), true
	}

	if looksLikeCloudflarePage(response.Header, body) {
		return retryResult(ReasonCloudflarePage, responseDetail(response)), true
	}
	if looksLikeHTMLOrLoginPage(response.Header, body) {
		return retryResult(ReasonHTMLOrLoginPage, responseDetail(response)), true
	}
	if looksLikeUpstreamErrorJSON(body) {
		return retryResult(ReasonUpstreamErrorJSON, responseDetail(response)), true
	}
	return ValidationResult{}, false
}

func validateOpenAIChat(response Response) ValidationResult {
	var payload openAIChatResponse
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		return retryResult(ReasonInvalidJSON, responseDetail(response))
	}
	if payload.Choices == nil {
		return retryResult(ReasonMissingChoices, responseDetail(response))
	}
	if len(*payload.Choices) == 0 {
		return retryResult(ReasonEmptyChoices, responseDetail(response))
	}

	hasContent := false
	hasToolOrRefusal := false
	for _, choice := range *payload.Choices {
		if choice.Message == nil {
			continue
		}
		if hasMeaningfulChatContent(choice.Message.Content) {
			hasContent = true
		}
		if len(choice.Message.ToolCalls) > 0 || strings.TrimSpace(choice.Message.Refusal) != "" {
			hasToolOrRefusal = true
		}
	}

	if payload.Usage != nil && payload.Usage.CompletionTokens == 0 && !hasToolOrRefusal {
		return retryResult(ReasonZeroCompletionTokens, responseDetail(response))
	}
	if !hasContent && !hasToolOrRefusal {
		return retryResult(ReasonEmptyContent, responseDetail(response))
	}
	return okResult()
}

func validateOpenAIResponses(response Response) ValidationResult {
	var payload openAIResponsesResponse
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		return retryResult(ReasonInvalidJSON, responseDetail(response))
	}
	if payload.Output == nil || len(*payload.Output) == 0 {
		return retryResult(ReasonEmptyOutput, responseDetail(response))
	}

	hasText := false
	hasTool := false
	hasRefusal := false
	for _, item := range *payload.Output {
		switch item.Type {
		case "message":
			if item.Content == nil {
				continue
			}
			for _, contentItem := range *item.Content {
				switch contentItem.Type {
				case "output_text":
					if contentItem.Text != nil && strings.TrimSpace(*contentItem.Text) != "" {
						hasText = true
					}
				case "refusal":
					if (contentItem.Refusal != nil && strings.TrimSpace(*contentItem.Refusal) != "") ||
						(contentItem.Text != nil && strings.TrimSpace(*contentItem.Text) != "") {
						hasRefusal = true
					}
				}
			}
		case "output_text":
			if item.Text != nil && strings.TrimSpace(*item.Text) != "" {
				hasText = true
			}
		case "function_call":
			hasTool = true
		case "refusal":
			if (item.Refusal != nil && strings.TrimSpace(*item.Refusal) != "") ||
				(item.Text != nil && strings.TrimSpace(*item.Text) != "") {
				hasRefusal = true
			}
		}
	}

	if !hasText && !hasTool && !hasRefusal {
		return retryResult(ReasonNoValidOutput, responseDetail(response))
	}
	if payload.Usage != nil && payload.Usage.OutputTokens == 0 && !hasTool && !hasRefusal {
		return retryResult(ReasonZeroOutputTokens, responseDetail(response))
	}
	return okResult()
}

func validateAnthropic(response Response) ValidationResult {
	var payload anthropicMessageResponse
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		return retryResult(ReasonInvalidJSON, responseDetail(response))
	}
	if !hasMeaningfulAnthropicContent(payload.Content) {
		if payload.StopReason != nil && strings.TrimSpace(*payload.StopReason) != "" {
			return retryResult(ReasonStopWithoutContent, responseDetail(response))
		}
		return retryResult(ReasonEmptyContent, responseDetail(response))
	}
	return okResult()
}

func validateGemini(response Response) ValidationResult {
	var payload geminiGenerateContentResponse
	if err := json.Unmarshal(response.Body, &payload); err != nil {
		return retryResult(ReasonInvalidJSON, responseDetail(response))
	}
	if len(payload.Candidates) == 0 {
		if payload.PromptFeedback != nil && strings.TrimSpace(payload.PromptFeedback.BlockReason) != "" {
			return retryResult(ReasonBlockedNoValidReply, responseDetail(response))
		}
		return retryResult(ReasonEmptyCandidates, responseDetail(response))
	}

	hasParts := false
	hasValidCandidate := false
	for _, candidate := range payload.Candidates {
		if candidate == nil || candidate.Content == nil || len(candidate.Content.Parts) == 0 {
			continue
		}
		hasParts = true
		if hasMeaningfulGeminiCandidate(candidate) {
			hasValidCandidate = true
			break
		}
	}

	if !hasParts {
		if payload.PromptFeedback != nil && strings.TrimSpace(payload.PromptFeedback.BlockReason) != "" {
			return retryResult(ReasonBlockedNoValidReply, responseDetail(response))
		}
		return retryResult(ReasonCandidateWithoutPart, responseDetail(response))
	}
	if !hasValidCandidate {
		if payload.PromptFeedback != nil && strings.TrimSpace(payload.PromptFeedback.BlockReason) != "" {
			return retryResult(ReasonBlockedNoValidReply, responseDetail(response))
		}
		return retryResult(ReasonNoValidCandidate, responseDetail(response))
	}
	return okResult()
}

func okResult() ValidationResult {
	return ValidationResult{
		Status: ValidationOK,
	}
}

func retryResult(reason, detail string) ValidationResult {
	return ValidationResult{
		Status:    ValidationRetry,
		Reason:    reason,
		Detail:    detail,
		Retryable: true,
	}
}

func responseDetail(response Response) string {
	contentType := ""
	if response.Header != nil {
		contentType = strings.TrimSpace(response.Header.Get("Content-Type"))
	}
	if contentType == "" {
		return fmt.Sprintf("status=%d", response.StatusCode)
	}
	return fmt.Sprintf("status=%d content_type=%s", response.StatusCode, contentType)
}

func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func looksLikeHTMLOrLoginPage(header http.Header, body []byte) bool {
	text := strings.ToLower(strings.TrimSpace(string(body)))
	contentType := ""
	if header != nil {
		contentType = strings.ToLower(header.Get("Content-Type"))
	}
	if !strings.Contains(contentType, "text/html") &&
		!strings.Contains(text, "<html") &&
		!strings.Contains(text, "<!doctype html") {
		return false
	}
	if strings.Contains(text, "login") ||
		strings.Contains(text, "sign in") ||
		strings.Contains(text, "log in") {
		return true
	}
	return true
}

func looksLikeCloudflarePage(header http.Header, body []byte) bool {
	text := strings.ToLower(strings.TrimSpace(string(body)))
	if strings.Contains(text, "cloudflare ray id") ||
		strings.Contains(text, "attention required") ||
		strings.Contains(text, "just a moment") ||
		strings.Contains(text, "cf-browser-verification") ||
		strings.Contains(text, "/cdn-cgi/") ||
		strings.Contains(text, "cloudflare tunnel error") {
		return true
	}
	if header == nil {
		return false
	}
	if header.Get("CF-Ray") != "" {
		return true
	}
	return strings.Contains(strings.ToLower(header.Get("Server")), "cloudflare")
}

func looksLikeUpstreamErrorJSON(body []byte) bool {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return false
	}
	rawError, ok := payload["error"]
	if !ok {
		return false
	}
	trimmed := bytes.TrimSpace(rawError)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return false
	}
	return true
}

func hasMeaningfulChatContent(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return false
	}
	var s string
	if err := json.Unmarshal(trimmed, &s); err == nil {
		return strings.TrimSpace(s) != ""
	}
	var parts []map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &parts); err == nil {
		for _, part := range parts {
			if rawMapHasMeaningfulValue(part, "type", "index", "annotations") {
				return true
			}
		}
		return false
	}
	return true
}

func rawMapHasMeaningfulValue(values map[string]json.RawMessage, ignoredKeys ...string) bool {
	ignored := make(map[string]struct{}, len(ignoredKeys))
	for _, key := range ignoredKeys {
		ignored[key] = struct{}{}
	}
	for key, raw := range values {
		if _, ok := ignored[key]; ok {
			continue
		}
		if rawJSONHasMeaningfulValue(raw) {
			return true
		}
	}
	return false
}

func rawJSONHasMeaningfulValue(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 ||
		bytes.Equal(trimmed, []byte("null")) ||
		bytes.Equal(trimmed, []byte(`""`)) ||
		bytes.Equal(trimmed, []byte("[]")) ||
		bytes.Equal(trimmed, []byte("{}")) {
		return false
	}
	var s string
	if err := json.Unmarshal(trimmed, &s); err == nil {
		return strings.TrimSpace(s) != ""
	}
	return true
}

func hasMeaningfulAnthropicContent(blocks []anthropicContentBlock) bool {
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if block.Text != nil && strings.TrimSpace(*block.Text) != "" {
				return true
			}
		case "thinking":
			if block.Thinking != nil && strings.TrimSpace(*block.Thinking) != "" {
				return true
			}
		case "tool_use", "server_tool_use":
			if strings.TrimSpace(block.ID) != "" || block.Name != nil || len(bytes.TrimSpace(block.Input)) > 0 {
				return true
			}
		case "image", "document":
			if block.Source != nil {
				return true
			}
		case "redacted_thinking":
			if strings.TrimSpace(block.Data) != "" {
				return true
			}
		case "tool_result", "web_search_tool_result", "code_execution_tool_result":
			if block.Content != nil {
				return true
			}
		}
	}
	return false
}

func hasMeaningfulGeminiCandidate(candidate *geminiCandidate) bool {
	if candidate == nil || candidate.Content == nil {
		return false
	}
	for _, part := range candidate.Content.Parts {
		if part == nil {
			continue
		}
		if !part.Thought && strings.TrimSpace(part.Text) != "" {
			return true
		}
		if part.FunctionCall != nil ||
			part.InlineData != nil ||
			part.FileData != nil ||
			part.ExecutableCode != nil ||
			part.CodeExecutionResult != nil {
			return true
		}
	}
	return false
}

type anthropicMessageResponse struct {
	Content    []anthropicContentBlock `json:"content"`
	StopReason *string                 `json:"stop_reason,omitempty"`
}

type anthropicContentBlock struct {
	Type     string          `json:"type"`
	Text     *string         `json:"text,omitempty"`
	Thinking *string         `json:"thinking,omitempty"`
	ID       string          `json:"id,omitempty"`
	Name     *string         `json:"name,omitempty"`
	Input    json.RawMessage `json:"input,omitempty"`
	Source   json.RawMessage `json:"source,omitempty"`
	Data     string          `json:"data,omitempty"`
	Content  json.RawMessage `json:"content,omitempty"`
}

type geminiGenerateContentResponse struct {
	Candidates     []*geminiCandidate `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback,omitempty"`
}

type geminiCandidate struct {
	Content *struct {
		Parts []*geminiPart `json:"parts"`
	} `json:"content,omitempty"`
}

type geminiPart struct {
	Text                string          `json:"text,omitempty"`
	Thought             bool            `json:"thought,omitempty"`
	FunctionCall        json.RawMessage `json:"functionCall,omitempty"`
	InlineData          json.RawMessage `json:"inlineData,omitempty"`
	FileData            json.RawMessage `json:"fileData,omitempty"`
	ExecutableCode      json.RawMessage `json:"executableCode,omitempty"`
	CodeExecutionResult json.RawMessage `json:"codeExecutionResult,omitempty"`
}

type openAIChatResponse struct {
	Choices *[]openAIChatChoice `json:"choices"`
	Usage   *struct {
		CompletionTokens int64 `json:"completion_tokens"`
	} `json:"usage,omitempty"`
}

type openAIChatChoice struct {
	Message *openAIChatMessage `json:"message,omitempty"`
}

type openAIChatMessage struct {
	Content   json.RawMessage   `json:"content,omitempty"`
	ToolCalls []json.RawMessage `json:"tool_calls,omitempty"`
	Refusal   string            `json:"refusal,omitempty"`
}

type openAIResponsesResponse struct {
	Output *[]openAIResponsesItem `json:"output"`
	Usage  *struct {
		OutputTokens int64 `json:"output_tokens"`
	} `json:"usage,omitempty"`
}

type openAIResponsesItem struct {
	Type    string                     `json:"type,omitempty"`
	Content *[]openAIResponsesTextItem `json:"content,omitempty"`
	Text    *string                    `json:"text,omitempty"`
	Refusal *string                    `json:"refusal,omitempty"`
}

type openAIResponsesTextItem struct {
	Type    string  `json:"type,omitempty"`
	Text    *string `json:"text,omitempty"`
	Refusal *string `json:"refusal,omitempty"`
}
