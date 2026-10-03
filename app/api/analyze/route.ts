import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";

type VideoInput = {
  name: string;
  videoNumber?: number;
  assetId: string;
  secureUrl: string;
  publicId: string;
};

type TranscriptSegment = {
  transcript?: string;
  start_time?: number;
  end_time?: number;
};

type ReferenceMatch = {
  referenceIndex: number;
  matched: boolean;
};

type MatchResult = {
  videoNumber: number;
  videoName: string;
  videoUrl: string;
  publicId: string;
  startTime: number;
  endTime: number;
  transcript: string;
  matched: boolean;
  referenceMatches: ReferenceMatch[];
  referenceIndexes?: number[];
};

type VideoResult = {
  videoNumber: number;
  videoName: string;
  videoUrl: string;
  publicId: string;
  status:
    | "matched"
    | "partial"
    | "no-match"
    | "error";
  matches: MatchResult[];
  matchedReferenceIndexes: number[];
  unmatchedReferenceIndexes: number[];
  error?: string;
};

const sleep = (
  ms: number
) =>
  new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );

/*
 * =========================================================
 * CONFIG
 * =========================================================
 */

function getConfig() {
  const cloudName =
    process.env
      .NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  const apiKey =
    process.env.CLOUDINARY_API_KEY;

  const apiSecret =
    process.env
      .CLOUDINARY_API_SECRET;

  if (
    !cloudName ||
    !apiKey ||
    !apiSecret
  ) {
    throw new Error(
      "Missing Cloudinary server credentials. Check .env.local."
    );
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
  };
}

function authHeader(
  apiKey: string,
  apiSecret: string
) {
  return `Basic ${Buffer.from(
    `${apiKey}:${apiSecret}`
  ).toString("base64")}`;
}

/*
 * =========================================================
 * IMAGE DESCRIPTION
 * =========================================================
 */

async function describeReferenceImage(
  referenceUrl: string,
  referenceNumber: number
): Promise<string> {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } = getConfig();

  const endpoint =
    `https://api.cloudinary.com/v2/analysis/${cloudName}` +
    `/analyze/ai_vision_general`;

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            authHeader(
              apiKey,
              apiSecret
            ),
        },

        body: JSON.stringify({
          source: {
            uri: referenceUrl,
          },

          prompts: [
            `
You are analyzing REFERENCE VIEW ${referenceNumber}
for a visual evidence investigation.

Describe the main target shown in this image.

Focus on visual characteristics useful for identifying
the SAME physical target in CCTV/security footage.

Include:
- object type
- dominant colors
- shape
- distinctive markings
- logos
- visible text
- patterns
- unusual visual features
- distinctive proportions
- distinctive design elements

Do not invent details that cannot be seen.

This is one reference view among multiple views of the
same target.
            `.trim(),
          ],
        }),
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Cloudinary AI Vision failed for reference ${referenceNumber} (${response.status}): ${errorText}`
    );
  }

  const json =
    await response.json();

  const description =
    json?.data?.analysis
      ?.responses?.[0]?.value;

  if (!description) {
    throw new Error(
      `Cloudinary AI Vision returned no description for reference ${referenceNumber}.`
    );
  }

  return String(
    description
  );
}

/*
 * =========================================================
 * VIDEO ANALYSIS
 * =========================================================
 */

async function startVideoAnalysis(
  videoAssetId: string,
  targetProfile: string
): Promise<string> {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } = getConfig();

  const endpoint =
    `https://api.cloudinary.com/v2/video/${cloudName}` +
    `/ai_video_analysis`;

  const prompt = `
You are analyzing CCTV/security video for a visual
evidence investigation.

The reference images are multiple views of the SAME
TARGET.

TARGET REFERENCE PROFILE:

${targetProfile}

There may be 1, 2, 3, 4, 5 or more reference views.

Evaluate EACH reference independently.

For EVERY scene segment, use this exact structure:

REFERENCE 1: MATCH YES
REFERENCE 2: MATCH NO
REFERENCE 3: MATCH YES

OVERALL MATCH: YES

Then write the visible evidence description.

Rules:

1. MATCH YES means the visible evidence reasonably
supports that particular reference.

2. MATCH NO means that reference is not supported.

3. Do NOT mark every reference YES just because one
reference matches.

4. The same physical target can look different from
different angles.

5. Consider:
- colors
- shape
- logos
- text
- symbols
- patterns
- distinctive markings
- proportions
- distinctive design

6. OVERALL MATCH is YES when at least one reference
view is reasonably supported.

7. OVERALL MATCH is NO when none of the reference views
are reasonably supported.

8. When references match, describe:
- where the target appears
- location in the frame
- visible characteristics
- surrounding context
- why those specific references are supported

9. Be conservative.

10. Only describe visible evidence.

11. Do not skip a reference number.

If there are 3 references, always provide:
REFERENCE 1
REFERENCE 2
REFERENCE 3

If there are 5 references, always provide:
REFERENCE 1
REFERENCE 2
REFERENCE 3
REFERENCE 4
REFERENCE 5

The reference numbers must correspond to the uploaded
reference images.
  `.trim();

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            authHeader(
              apiKey,
              apiSecret
            ),
        },

        body: JSON.stringify({
          video_asset_id:
            videoAssetId,

          visual_transcription_prompt:
            prompt,
        }),
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Cloudinary AI Video Analysis start failed (${response.status}): ${errorText}`
    );
  }

  const json =
    await response.json();

  const jobId =
    json?.data?.job_id;

  if (!jobId) {
    throw new Error(
      "Cloudinary AI Video Analysis did not return a job ID."
    );
  }

  return String(
    jobId
  );
}

/*
 * =========================================================
 * POLL
 * =========================================================
 */

async function waitForVideoAnalysis(
  jobId: string
): Promise<string> {
  const {
    cloudName,
    apiKey,
    apiSecret,
  } = getConfig();

  const endpoint =
    `https://api.cloudinary.com/v2/video/${cloudName}` +
    `/ai_video_analysis/${jobId}`;

  for (
    let attempt = 0;
    attempt < 60;
    attempt += 1
  ) {
    const response =
      await fetch(
        endpoint,
        {
          method: "GET",

          headers: {
            Authorization:
              authHeader(
                apiKey,
                apiSecret
              ),
          },

          cache: "no-store",
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `Cloudinary AI Video Analysis polling failed (${response.status}): ${errorText}`
      );
    }

    const json =
      await response.json();

    const data =
      json?.data;

    if (
      data?.status ===
      "completed"
    ) {
      const transcriptUrl =
        data
          ?.visual_transcription
          ?.url;

      if (!transcriptUrl) {
        throw new Error(
          "Analysis completed but no visual transcription URL was returned."
        );
      }

      return String(
        transcriptUrl
      );
    }

    if (
      data?.status ===
      "failed"
    ) {
      throw new Error(
        "Cloudinary AI Video Analysis job failed."
      );
    }

    await sleep(3000);
  }

  throw new Error(
    "Video analysis timed out. Try a shorter video for the demo."
  );
}

/*
 * =========================================================
 * TRANSCRIPT
 * =========================================================
 */

async function fetchTranscript(
  url: string
): Promise<TranscriptSegment[]> {
  const response =
    await fetch(
      url,
      {
        cache: "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `Could not fetch the visual transcription (${response.status}).`
    );
  }

  const data =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Unexpected visual transcription format."
    );
  }

  return data as TranscriptSegment[];
}

/*
 * =========================================================
 * PARSE PER-REFERENCE MATCH
 *
 * Accepts:
 *
 * REFERENCE 1: MATCH YES
 * REFERENCE VIEW 1: MATCH YES
 * REF 1: MATCH YES
 * REFERENCE 1 - MATCH YES
 * =========================================================
 */

function parseReferenceMatches(
  transcript: string,
  referenceCount: number
): ReferenceMatch[] {
  const results: ReferenceMatch[] =
    [];

  for (
    let index = 1;
    index <= referenceCount;
    index += 1
  ) {
    const pattern =
      new RegExp(
        `(?:REFERENCE(?:\\s+VIEW)?|REF)\\s*${index}\\s*[:\\-]?\\s*MATCH\\s*[:\\-]?\\s*(YES|NO)`,
        "i"
      );

    const match =
      transcript.match(
        pattern
      );

    results.push({
      referenceIndex:
        index,

      matched:
        match?.[1]
          ?.toUpperCase() ===
        "YES",
    });
  }

  return results;
}

/*
 * =========================================================
 * FALLBACK:
 * REFERENCE MATCH: 1,2
 * REFERENCE MATCHES: 1,2
 * =========================================================
 */

function parseReferenceIndexesFallback(
  transcript: string
): number[] {
  const match =
    transcript.match(
      /REFERENCE\s+MATCH(?:ES)?\s*[:\-]\s*([0-9,\s]+)/i
    );

  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(",")
    .map(
      (
        value: string
      ) =>
        Number(
          value.trim()
        )
    )
    .filter(
      (
        value: number
      ) =>
        Number.isInteger(
          value
        ) &&
        value > 0
    );
}

/*
 * =========================================================
 * POST
 * =========================================================
 */

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    /*
     * -------------------------------------------------------
     * REFERENCES
     * -------------------------------------------------------
     */

    let referenceUrls: string[] =
      Array.isArray(
        body?.referenceUrls
      )
        ? body.referenceUrls
            .filter(
              (
                value: unknown
              ): value is string =>
                typeof value ===
                "string"
            )
            .map(
              (
                value: string
              ) =>
                value.trim()
            )
            .filter(
              (
                value: string
              ) =>
                Boolean(value)
            )
        : [];

    /*
     * Backward compatibility.
     */

    if (
      referenceUrls.length ===
        0 &&
      typeof body?.referenceUrl ===
        "string" &&
      body.referenceUrl.trim()
    ) {
      referenceUrls.push(
        body.referenceUrl.trim()
      );
    }

    /*
     * -------------------------------------------------------
     * DESCRIPTION
     * -------------------------------------------------------
     */

    const manualDescription =
      typeof body
        ?.manualDescription ===
      "string"
        ? body.manualDescription.trim()
        : "";

    /*
     * -------------------------------------------------------
     * VIDEOS
     * -------------------------------------------------------
     */

    const videos: VideoInput[] =
      Array.isArray(
        body?.videos
      )
        ? (body.videos as VideoInput[])
        : [];

    if (!referenceUrls.length) {
      return NextResponse.json(
        {
          error:
            "At least one reference image is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!videos.length) {
      return NextResponse.json(
        {
          error:
            "At least one video is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =======================================================
     * DESCRIBE ALL REFERENCES
     * =======================================================
     */

    const descriptions =
      await Promise.all(
        referenceUrls.map(
          async (
            url: string,
            index: number
          ) => ({
            index:
              index + 1,

            description:
              await describeReferenceImage(
                url,
                index + 1
              ),
          })
        )
      );

    const labeledProfile =
      descriptions
        .map(
          (
            item: {
              index: number;
              description: string;
            }
          ) =>
            `REFERENCE VIEW ${item.index}:\n${item.description}`
        )
        .join(
          "\n\n"
        );

    const manualSection =
      manualDescription
        ? `\n\nMANUAL INVESTIGATOR DESCRIPTION:\n${manualDescription}`
        : "";

    const referenceDescription =
      `${labeledProfile}${manualSection}`.trim();

    /*
     * =======================================================
     * ANALYZE VIDEOS
     * =======================================================
     */

    const videoResults: VideoResult[] =
      [];

    const allMatches: MatchResult[] =
      [];

    const videoErrors: Array<{
      videoName: string;
      error: string;
    }> = [];

    for (
      let index = 0;
      index < videos.length;
      index += 1
    ) {
      const video =
        videos[index];

      const videoNumber =
        Number.isInteger(
          video.videoNumber
        )
          ? Number(
              video.videoNumber
            )
          : index + 1;

      try {
        const jobId =
          await startVideoAnalysis(
            video.assetId,
            referenceDescription
          );

        const transcriptUrl =
          await waitForVideoAnalysis(
            jobId
          );

        const segments =
          await fetchTranscript(
            transcriptUrl
          );

        const matches: MatchResult[] =
          [];

        /*
         * References matching anywhere
         * in the video.
         */
        const matchedReferences =
          new Set<number>();

        for (const segment of segments) {
          const transcript =
            String(
              segment.transcript ||
                ""
            );

          const startTime =
            Number(
              segment.start_time ||
                0
            );

          const endTime =
            Number(
              segment.end_time ||
                startTime
            );

          let referenceMatches =
            parseReferenceMatches(
              transcript,
              referenceUrls.length
            );

          /*
           * Determine whether we actually
           * received reference-level results.
           */
          const explicitReferenceMatchFound =
            referenceMatches.some(
              (
                item
              ) =>
                item.matched
            );

          /*
           * Fallback for older AI output.
           */
          if (
            !explicitReferenceMatchFound
          ) {
            const fallbackIndexes =
              parseReferenceIndexesFallback(
                transcript
              );

            if (
              fallbackIndexes.length
            ) {
              for (
                const referenceIndex of
                  fallbackIndexes
              ) {
                if (
                  referenceIndex >=
                    1 &&
                  referenceIndex <=
                    referenceUrls.length
                ) {
                  referenceMatches =
                    referenceMatches.map(
                      (
                        item
                      ) =>
                        item.referenceIndex ===
                        referenceIndex
                          ? {
                              ...item,
                              matched:
                                true,
                            }
                          : item
                    );
                }
              }
            }
          }

          const referenceIndexes =
            referenceMatches
              .filter(
                (
                  item
                ) =>
                  item.matched
              )
              .map(
                (
                  item
                ) =>
                  item.referenceIndex
              );

          /*
           * A segment becomes an evidence
           * occurrence only when at least one
           * reference is actually supported.
           */
          if (
            referenceIndexes.length ===
            0
          ) {
            continue;
          }

          const match: MatchResult =
            {
              videoNumber,

              videoName:
                video.name,

              videoUrl:
                video.secureUrl,

              publicId:
                video.publicId,

              startTime,

              endTime,

              transcript,

              matched:
                true,

              referenceMatches,

              referenceIndexes,
            };

          matches.push(
            match
          );

          allMatches.push(
            match
          );

          for (
            const referenceIndex of
              referenceIndexes
          ) {
            matchedReferences.add(
              referenceIndex
            );
          }
        }

        matches.sort(
          (
            a: MatchResult,
            b: MatchResult
          ) =>
            a.startTime -
            b.startTime
        );

        /*
         * -----------------------------------------------
         * REF STATUS
         * -----------------------------------------------
         */

        const matchedReferenceIndexes =
          Array.from(
            matchedReferences
          ).sort(
            (
              a: number,
              b: number
            ) =>
              a - b
          );

        const allReferenceIndexes: number[] =
          Array.from(
            {
              length:
                referenceUrls.length,
            },
            (
              _unused: unknown,
              index: number
            ) =>
              index + 1
          );

        const unmatchedReferenceIndexes =
          allReferenceIndexes.filter(
            (
              referenceIndex: number
            ) =>
              !matchedReferences.has(
                referenceIndex
              )
          );

        let status:
          | "matched"
          | "partial"
          | "no-match";

        if (
          matchedReferenceIndexes.length ===
          referenceUrls.length
        ) {
          status =
            "matched";
        } else if (
          matchedReferenceIndexes.length >
          0
        ) {
          status =
            "partial";
        } else {
          status =
            "no-match";
        }

        videoResults.push(
          {
            videoNumber,

            videoName:
              video.name,

            videoUrl:
              video.secureUrl,

            publicId:
              video.publicId,

            status,

            matches,

            matchedReferenceIndexes,

            unmatchedReferenceIndexes,
          }
        );
      } catch (error) {
        const message =
          error instanceof
          Error
            ? error.message
            : "Unknown analysis error.";

        const allReferenceIndexes: number[] =
          Array.from(
            {
              length:
                referenceUrls.length,
            },
            (
              _unused: unknown,
              index: number
            ) =>
              index + 1
          );

        videoResults.push(
          {
            videoNumber,

            videoName:
              video.name,

            videoUrl:
              video.secureUrl,

            publicId:
              video.publicId,

            status:
              "error",

            matches: [],

            matchedReferenceIndexes:
              [],

            unmatchedReferenceIndexes:
              allReferenceIndexes,

            error:
              message,
          }
        );

        videoErrors.push(
          {
            videoName:
              video.name,

            error:
              message,
          }
        );
      }
    }

    /*
     * =======================================================
     * SORT
     * =======================================================
     */

    videoResults.sort(
      (
        a: VideoResult,
        b: VideoResult
      ) =>
        a.videoNumber -
        b.videoNumber
    );

    allMatches.sort(
      (
        a: MatchResult,
        b: MatchResult
      ) => {
        if (
          a.videoNumber !==
          b.videoNumber
        ) {
          return (
            a.videoNumber -
            b.videoNumber
          );
        }

        return (
          a.startTime -
          b.startTime
        );
      }
    );

    /*
     * =======================================================
     * COUNTS
     * =======================================================
     */

    const matchedVideoCount =
      videoResults.filter(
        (
          video: VideoResult
        ) =>
          video.status ===
          "matched"
      ).length;

    const partialVideoCount =
      videoResults.filter(
        (
          video: VideoResult
        ) =>
          video.status ===
          "partial"
      ).length;

    const noMatchVideoCount =
      videoResults.filter(
        (
          video: VideoResult
        ) =>
          video.status ===
          "no-match"
      ).length;

    const errorVideoCount =
      videoResults.filter(
        (
          video: VideoResult
        ) =>
          video.status ===
          "error"
      ).length;

    const matchedVideoNumbers =
      videoResults
        .filter(
          (
            video: VideoResult
          ) =>
            video.status ===
              "matched" ||
            video.status ===
              "partial"
        )
        .map(
          (
            video: VideoResult
          ) =>
            video.videoNumber
        );

    /*
     * =======================================================
     * RESPONSE
     * =======================================================
     */

    return NextResponse.json({
      referenceDescription,

      referenceCount:
        referenceUrls.length,

      totalVideos:
        videos.length,

      matchedVideoCount,

      partialVideoCount,

      noMatchVideoCount,

      errorVideoCount,

      totalMatches:
        allMatches.length,

      matchedVideoNumbers,

      matches:
        allMatches,

      videoResults,

      videoErrors,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "Investigation failed.",
      },
      {
        status: 500,
      }
    );
  }
}