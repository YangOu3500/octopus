package grouphealth

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestBuildProbeRequestForResponses(t *testing.T) {
	channel := &model.Channel{
		Type:     outbound.OutboundTypeOpenAIResponse,
		BaseUrls: []model.BaseUrl{{URL: "https://example.com/v1"}},
	}
	usedKey := &model.ChannelKey{ID: 1, ChannelKey: "sk-test"}

	req, err := buildProbeRequest(context.Background(), channel, usedKey, "gpt-5.4")
	if err != nil {
		t.Fatalf("buildProbeRequest returned error: %v", err)
	}
	if req.URL.Path != "/v1/responses" {
		t.Fatalf("expected /v1/responses, got %s", req.URL.Path)
	}
}

func TestBuildProbeRequestUsesOptions(t *testing.T) {
	channel := &model.Channel{
		Type:     outbound.OutboundTypeOpenAIChat,
		BaseUrls: []model.BaseUrl{{URL: "https://example.com/v1"}},
	}
	usedKey := &model.ChannelKey{ID: 1, ChannelKey: "sk-test"}

	req, err := buildProbeRequestWithOptions(context.Background(), channel, usedKey, "gpt-5.4", ProbeOptions{
		Prompt:      "只回复 OK",
		MaxTokens:   8,
		Temperature: 0,
	})
	if err != nil {
		t.Fatalf("buildProbeRequestWithOptions returned error: %v", err)
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		t.Fatalf("ReadAll body failed: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("Unmarshal body failed: %v body=%s", err, string(body))
	}
	tokenLimit := payload["max_tokens"]
	if tokenLimit == nil {
		tokenLimit = payload["max_completion_tokens"]
	}
	if tokenLimit.(float64) != 8 {
		t.Fatalf("expected token limit 8, got max_tokens=%#v max_completion_tokens=%#v", payload["max_tokens"], payload["max_completion_tokens"])
	}
	if payload["temperature"].(float64) != 0 {
		t.Fatalf("expected temperature 0, got %#v", payload["temperature"])
	}
	messages := payload["messages"].([]any)
	firstMessage := messages[0].(map[string]any)
	if firstMessage["content"] != "只回复 OK" {
		t.Fatalf("expected prompt, got %#v", firstMessage["content"])
	}
}

func TestBuildProbeRequestForEmbeddings(t *testing.T) {
	channel := &model.Channel{
		Type:     outbound.OutboundTypeOpenAIEmbedding,
		BaseUrls: []model.BaseUrl{{URL: "https://example.com/v1"}},
	}
	usedKey := &model.ChannelKey{ID: 1, ChannelKey: "sk-test"}

	req, err := buildProbeRequest(context.Background(), channel, usedKey, "text-embedding-3-large")
	if err != nil {
		t.Fatalf("buildProbeRequest returned error: %v", err)
	}
	if req.URL.Path != "/v1/embeddings" {
		t.Fatalf("expected /v1/embeddings, got %s", req.URL.Path)
	}
}

func TestRunCandidateValidatesSuccessfulBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.Copy(io.Discard, r.Body)
		_, _ = w.Write([]byte(`{"id":"chatcmpl_1","object":"chat.completion","choices":[]}`))
	}))
	defer server.Close()

	channel := model.Channel{
		Type:     outbound.OutboundTypeOpenAIChat,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
	}
	usedKey := model.ChannelKey{ID: 1, ChannelKey: "sk-test"}

	result := (&Prober{}).RunCandidate(context.Background(), channel, usedKey, "gpt-5.4")
	if result.Success {
		t.Fatal("expected empty choices response to fail validation")
	}
	if result.HTTPStatus != http.StatusOK {
		t.Fatalf("expected http 200, got %d", result.HTTPStatus)
	}
	if !bytes.Contains([]byte(result.ErrorMessage), []byte("empty_choices")) {
		t.Fatalf("expected empty_choices error, got %q", result.ErrorMessage)
	}
}

func TestRunCandidateParsesUnexpectedSSEErrorBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(`data: {"error":{"message":"Chat upstream returned 403 (request id: test)","type":"upstream_error"}}` + "\n\n"))
	}))
	defer server.Close()

	channel := model.Channel{
		Type:     outbound.OutboundTypeOpenAIChat,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
	}
	usedKey := model.ChannelKey{ID: 1, ChannelKey: "sk-test"}

	result := (&Prober{}).RunCandidateWithOptions(context.Background(), channel, usedKey, "gpt-5.4", ProbeOptions{
		Prompt:    "只回复 OK",
		MaxTokens: 8,
		Stream:    false,
	})
	if result.Success {
		t.Fatal("expected SSE error response to fail")
	}
	if result.HTTPStatus != http.StatusForbidden {
		t.Fatalf("expected inferred http 403, got %d (%q)", result.HTTPStatus, result.ErrorMessage)
	}
	if !strings.Contains(result.ErrorMessage, "upstream returned 403") {
		t.Fatalf("expected upstream error message, got %q", result.ErrorMessage)
	}
	if strings.TrimSpace(result.ResponseText) != "" {
		t.Fatalf("expected no response text for error-only stream, got %q", result.ResponseText)
	}
}
