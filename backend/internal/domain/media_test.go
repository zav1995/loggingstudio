package domain

import "testing"

func TestMediaValidate(t *testing.T) {
	cases := []struct {
		name    string
		media   Media
		wantErr bool
	}{
		{
			name: "valid",
			media: Media{
				ID:          "asset-123",
				HLSURL:      "https://cdn.example.com/stream.m3u8",
				StartedAtTC: "17:30:00:00",
				FrameRate:   25,
			},
		},
		{
			name: "missing id",
			media: Media{
				HLSURL:      "https://cdn.example.com/stream.m3u8",
				StartedAtTC: "17:30:00:00",
				FrameRate:   25,
			},
			wantErr: true,
		},
		{
			name: "bad url",
			media: Media{
				ID:          "asset-123",
				HLSURL:      "not-a-url",
				StartedAtTC: "17:30:00:00",
				FrameRate:   25,
			},
			wantErr: true,
		},
		{
			name: "bad timecode — too many parts",
			media: Media{
				ID:          "asset-123",
				HLSURL:      "https://cdn.example.com/stream.m3u8",
				StartedAtTC: "17:30:00:00:00",
				FrameRate:   25,
			},
			wantErr: true,
		},
		{
			name: "bad timecode — overflow hour",
			media: Media{
				ID:          "asset-123",
				HLSURL:      "https://cdn.example.com/stream.m3u8",
				StartedAtTC: "24:00:00:00",
				FrameRate:   25,
			},
			wantErr: true,
		},
		{
			name: "frame_rate too high",
			media: Media{
				ID:          "asset-123",
				HLSURL:      "https://cdn.example.com/stream.m3u8",
				StartedAtTC: "17:30:00:00",
				FrameRate:   240,
			},
			wantErr: true,
		},
		{
			name: "frame_rate zero",
			media: Media{
				ID:          "asset-123",
				HLSURL:      "https://cdn.example.com/stream.m3u8",
				StartedAtTC: "17:30:00:00",
				FrameRate:   0,
			},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.media.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}
