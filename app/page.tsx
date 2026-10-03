"use client";

import {
  ChangeEvent,
  useMemo,
  useRef,
  useState,
} from "react";

type Mode = "image" | "board";

type ReferenceItem = {
  id: string;
  name: string;
  size: number;
  url?: string;
  assetId?: string;
  publicId?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

type VideoItem = {
  id: string;
  videoNumber: number;
  name: string;
  size: number;
  secureUrl?: string;
  assetId?: string;
  publicId?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
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

type InvestigationResult = {
  referenceDescription: string;
  referenceCount: number;
  totalVideos: number;
  matchedVideoCount: number;
  partialVideoCount: number;
  noMatchVideoCount: number;
  errorVideoCount: number;
  totalMatches: number;
  matchedVideoNumbers: number[];
  matches: MatchResult[];
  videoResults: VideoResult[];
  videoErrors: {
    videoName: string;
    error: string;
  }[];
};

function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  const value =
    bytes /
    Math.pow(1024, index);

  return `${value.toFixed(
    value >= 10 ? 0 : 1
  )} ${units[index]}`;
}

function formatSeconds(seconds: number) {
  const total = Math.max(
    0,
    Math.floor(seconds || 0)
  );

  const hours = Math.floor(
    total / 3600
  );

  const minutes = Math.floor(
    (total % 3600) / 60
  );

  const secs = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(
      2,
      "0"
    )}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(secs).padStart(
    2,
    "0"
  )}`;
}

async function uploadCloudinary(
  file: File,
  type: "image" | "video"
) {
  const cloudName =
    process.env
      .NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  const preset =
    process.env
      .NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !preset) {
    throw new Error(
      "Cloudinary settings are missing in .env.local."
    );
  }

  const formData = new FormData();

  formData.append(
    "file",
    file
  );

  formData.append(
    "upload_preset",
    preset
  );

  const response =
    await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

  if (!response.ok) {
    throw new Error(
      `Cloudinary upload failed (${response.status}): ${await response.text()}`
    );
  }

  const data =
    await response.json();

  return {
    secureUrl: String(
      data?.secure_url || ""
    ),
    publicId: String(
      data?.public_id || ""
    ),
    assetId: String(
      data?.asset_id || ""
    ),
  };
}

/*
* Normalize every API result before putting it
* into React state.
*/
function normalizeInvestigation(
  raw: unknown,
  fallbackReferenceCount: number,
  fallbackVideoCount: number
): InvestigationResult {
  const source =
    raw &&
    typeof raw === "object"
      ? (raw as Partial<InvestigationResult>)
      : {};

  const referenceCount =
    Number(
      source.referenceCount ||
        fallbackReferenceCount
    ) || fallbackReferenceCount;

  const rawVideoResults =
    Array.isArray(
      source.videoResults
    )
      ? source.videoResults
      : [];

  const videoResults: VideoResult[] =
    rawVideoResults.map(
      (
        rawVideo,
        videoIndex
      ) => {
        const video =
          rawVideo as Partial<VideoResult>;

        const rawMatches =
          Array.isArray(
            video.matches
          )
            ? video.matches
            : [];

        const matches: MatchResult[] =
          rawMatches.map(
            (
              rawMatch
            ) => {
              const match =
                rawMatch as Partial<MatchResult>;

              let referenceMatches: ReferenceMatch[] =
                Array.isArray(
                  match.referenceMatches
                )
                  ? match.referenceMatches
                      .filter(
                        (
                          item
                        ) =>
                          item &&
                          typeof item ===
                            "object"
                      )
                      .map(
                        (
                          item
                        ) => ({
                          referenceIndex:
                            Number(
                              (
                                item as ReferenceMatch
                              )
                                .referenceIndex
                            ),

                          matched:
                            Boolean(
                              (
                                item as ReferenceMatch
                              )
                                .matched
                            ),
                        })
                      )
                      .filter(
                        (
                          item
                        ) =>
                          item.referenceIndex >=
                            1 &&
                          item.referenceIndex <=
                            referenceCount
                      )
                  : [];

              if (
                referenceMatches.length ===
                0
              ) {
                const matchedIndexes =
                  Array.isArray(
                    match.referenceIndexes
                  )
                    ? match.referenceIndexes
                        .map(
                          (
                            value
                          ) =>
                            Number(value)
                        )
                        .filter(
                          (
                            value
                          ) =>
                            Number.isInteger(
                              value
                            ) &&
                            value >= 1 &&
                            value <=
                              referenceCount
                        )
                    : [];

                referenceMatches =
                  Array.from(
                    {
                      length:
                        referenceCount,
                    },
                    (
                      _unused,
                      index
                    ) => ({
                      referenceIndex:
                        index + 1,

                      matched:
                        matchedIndexes.includes(
                          index + 1
                        ),
                    })
                  );
              }

              return {
                videoNumber:
                  Number(
                    match.videoNumber
                  ) ||
                  Number(
                    video.videoNumber
                  ) ||
                  videoIndex + 1,

                videoName:
                  String(
                    match.videoName ||
                      video.videoName ||
                      ""
                  ),

                videoUrl:
                  String(
                    match.videoUrl ||
                      video.videoUrl ||
                      ""
                  ),

                publicId:
                  String(
                    match.publicId ||
                      video.publicId ||
                      ""
                  ),

                startTime:
                  Number(
                    match.startTime ||
                      0
                  ),

                endTime:
                  Number(
                    match.endTime ||
                      match.startTime ||
                      0
                  ),

                transcript:
                  String(
                    match.transcript ||
                      ""
                  ),

                matched:
                  Boolean(
                    match.matched !==
                      false
                  ),

                referenceMatches,

                referenceIndexes:
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
                    ),
              };
            }
          );

        const matchedIndexes =
          Array.isArray(
            video.matchedReferenceIndexes
          )
            ? video.matchedReferenceIndexes
                .map(
                  (
                    value
                  ) =>
                    Number(value)
                )
                .filter(
                  (
                    value
                  ) =>
                    Number.isInteger(
                      value
                    ) &&
                    value >= 1 &&
                    value <=
                      referenceCount
                )
            : [];

        const inferredMatched =
          new Set<number>(
            matchedIndexes
          );

        for (const match of matches) {
          for (const ref of match.referenceMatches) {
            if (ref.matched) {
              inferredMatched.add(
                ref.referenceIndex
              );
            }
          }
        }

        const finalMatchedIndexes =
          Array.from(
            inferredMatched
          ).sort(
            (a, b) => a - b
          );

        const finalUnmatchedIndexes =
          Array.from(
            {
              length:
                referenceCount,
            },
            (
              _unused,
              index
            ) => index + 1
          ).filter(
            (
              index
            ) =>
              !finalMatchedIndexes.includes(
                index
              )
          );

        const rawStatus =
          video.status;

        let status:
          | "matched"
          | "partial"
          | "no-match"
          | "error";

        if (
          rawStatus ===
          "error"
        ) {
          status = "error";
        } else if (
          finalMatchedIndexes.length ===
          referenceCount
        ) {
          status = "matched";
        } else if (
          finalMatchedIndexes.length >
          0
        ) {
          status = "partial";
        } else {
          status = "no-match";
        }

        return {
          videoNumber:
            Number(
              video.videoNumber
            ) ||
            videoIndex + 1,

          videoName:
            String(
              video.videoName ||
                ""
            ),

          videoUrl:
            String(
              video.videoUrl ||
                ""
            ),

          publicId:
            String(
              video.publicId ||
                ""
            ),

          status,

          matches,

          matchedReferenceIndexes:
            finalMatchedIndexes,

          unmatchedReferenceIndexes:
            finalUnmatchedIndexes,

          error:
            typeof video.error ===
            "string"
              ? video.error
              : undefined,
        };
      }
    );

  videoResults.sort(
    (a, b) =>
      a.videoNumber -
      b.videoNumber
  );

  const allMatches =
    videoResults.flatMap(
      (video) =>
        video.matches
    );

  allMatches.sort(
    (a, b) => {
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

  const matchedVideoCount =
    videoResults.filter(
      (video) =>
        video.status ===
        "matched"
    ).length;

  const partialVideoCount =
    videoResults.filter(
      (video) =>
        video.status ===
        "partial"
    ).length;

  const noMatchVideoCount =
    videoResults.filter(
      (video) =>
        video.status ===
        "no-match"
    ).length;

  const errorVideoCount =
    videoResults.filter(
      (video) =>
        video.status ===
        "error"
    ).length;

  return {
    referenceDescription:
      String(
        source.referenceDescription ||
          ""
      ),

    referenceCount,

    totalVideos:
      Number(
        source.totalVideos ||
          videoResults.length ||
          fallbackVideoCount
      ),

    matchedVideoCount,

    partialVideoCount,

    noMatchVideoCount,

    errorVideoCount,

    totalMatches:
      allMatches.length,

    matchedVideoNumbers:
      videoResults
        .filter(
          (video) =>
            video.status ===
              "matched" ||
            video.status ===
              "partial"
        )
        .map(
          (video) =>
            video.videoNumber
        ),

    matches:
      allMatches,

    videoResults,

    videoErrors:
      Array.isArray(
        source.videoErrors
      )
        ? source.videoErrors
            .filter(
              (
                item
              ) =>
                item &&
                typeof item ===
                  "object"
            )
            .map(
              (
                item
              ) => ({
                videoName:
                  String(
                    (
                      item as {
                        videoName?: unknown;
                      }
                    )
                      .videoName ||
                      ""
                  ),

                error:
                  String(
                    (
                      item as {
                        error?: unknown;
                      }
                    )
                      .error ||
                      ""
                  ),
              })
            )
        : [],
  };
}

export default function HomePage() {
  const [mode, setMode] =
    useState<Mode>("image");

  const [references, setReferences] =
    useState<ReferenceItem[]>(
      []
    );

  const [videos, setVideos] =
    useState<VideoItem[]>(
      []
    );

  const [
    targetDescription,
    setTargetDescription,
  ] = useState("");

  const [
    investigation,
    setInvestigation,
  ] =
    useState<InvestigationResult | null>(
      null
    );

  const [
    investigationLoading,
    setInvestigationLoading,
  ] = useState(false);

  const [
    activeVideoNumber,
    setActiveVideoNumber,
  ] =
    useState<number | null>(
      null
    );

  const [
    selectedMatchIndex,
    setSelectedMatchIndex,
  ] = useState(0);

  const [notes, setNotes] =
    useState<Record<string, string>>(
      {}
    );

  const [
    reviewedMatches,
    setReviewedMatches,
  ] = useState<
    Record<string, boolean>
  >({});

  const referenceInput =
    useRef<HTMLInputElement | null>(
      null
    );

  const videoInput =
    useRef<HTMLInputElement | null>(
      null
    );

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  /*
   * REFERENCES
   */

  const addReferences =
    async (
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const selected =
        Array.from(
          event.target.files || []
        );

      event.target.value = "";

      for (const file of selected) {
        const id =
          crypto.randomUUID();

        setReferences(
          (current) => [
            ...current,
            {
              id,
              name: file.name,
              size: file.size,
              status:
                "uploading",
            },
          ]
        );

        try {
          const result =
            await uploadCloudinary(
              file,
              "image"
            );

          setReferences(
            (current) =>
              current.map(
                (item) =>
                  item.id === id
                    ? {
                        ...item,
                        status:
                          "ready",
                        url:
                          result.secureUrl,
                        assetId:
                          result.assetId,
                        publicId:
                          result.publicId,
                      }
                    : item
              )
          );
        } catch (error) {
          setReferences(
            (current) =>
              current.map(
                (item) =>
                  item.id === id
                    ? {
                        ...item,
                        status:
                          "error",
                        error:
                          error instanceof
                          Error
                            ? error.message
                            : "Upload failed.",
                      }
                    : item
              )
          );
        }
      }
    };

  /*
   * VIDEOS
   */

  const addVideos =
    async (
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const selected =
        Array.from(
          event.target.files || []
        );

      event.target.value = "";

      let nextNumber =
        videos.length + 1;

      for (const file of selected) {
        const id =
          crypto.randomUUID();

        const videoNumber =
          nextNumber;

        nextNumber += 1;

        setVideos(
          (current) => [
            ...current,
            {
              id,
              videoNumber,
              name: file.name,
              size: file.size,
              status:
                "uploading",
            },
          ]
        );

        try {
          const result =
            await uploadCloudinary(
              file,
              "video"
            );

          setVideos(
            (current) =>
              current.map(
                (item) =>
                  item.id === id
                    ? {
                        ...item,
                        status:
                          "ready",
                        secureUrl:
                          result.secureUrl,
                        assetId:
                          result.assetId,
                        publicId:
                          result.publicId,
                      }
                    : item
              )
          );
        } catch (error) {
          setVideos(
            (current) =>
              current.map(
                (item) =>
                  item.id === id
                    ? {
                        ...item,
                        status:
                          "error",
                        error:
                          error instanceof
                          Error
                            ? error.message
                            : "Upload failed.",
                      }
                    : item
              )
          );
        }
      }
    };

  /*
   * REMOVE
   */

  const removeReference =
    (id: string) => {
      setReferences(
        (current) =>
          current.filter(
            (item) =>
              item.id !== id
          )
      );
    };

  const removeVideo =
    (id: string) => {
      setVideos(
        (current) =>
          current
            .filter(
              (item) =>
                item.id !== id
            )
            .map(
              (
                item,
                index
              ) => ({
                ...item,
                videoNumber:
                  index + 1,
              })
            )
      );
    };

  /*
   * RUN INVESTIGATION
   */

  const runInvestigation =
    async () => {
      const readyReferences =
        references.filter(
          (item) =>
            item.status ===
              "ready" &&
            Boolean(item.url)
        );

      const readyVideos =
        videos.filter(
          (item) =>
            item.status ===
              "ready" &&
            Boolean(
              item.assetId
            ) &&
            Boolean(
              item.secureUrl
            ) &&
            Boolean(
              item.publicId
            )
        );

      if (
        !readyReferences.length
      ) {
        alert(
          "Upload at least one reference image."
        );
        return;
      }

      if (!readyVideos.length) {
        alert(
          "Upload at least one video."
        );
        return;
      }

      setInvestigationLoading(
        true
      );

      setInvestigation(null);

      setActiveVideoNumber(
        null
      );

      setSelectedMatchIndex(
        0
      );

      try {
        const referenceUrls =
          readyReferences
            .map(
              (
                item
              ) =>
                item.url
            )
            .filter(
              (
                url
              ): url is string =>
                Boolean(url)
            );

        const response =
          await fetch(
            "/api/analyze",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                referenceUrls,

                manualDescription:
                  targetDescription,

                videos:
                  readyVideos.map(
                    (
                      video
                    ) => ({
                      videoNumber:
                        video.videoNumber,

                      name:
                        video.name,

                      assetId:
                        video.assetId,

                      secureUrl:
                        video.secureUrl,

                      publicId:
                        video.publicId,
                    })
                  ),
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Investigation failed."
          );
        }

        const safeResult =
          normalizeInvestigation(
            data,
            referenceUrls.length,
            readyVideos.length
          );

        setInvestigation(
          safeResult
        );

        const firstEvidence =
          safeResult.videoResults.find(
            (
              item
            ) =>
              item.status ===
                "matched" ||
              item.status ===
                "partial"
          );

        if (firstEvidence) {
          setActiveVideoNumber(
            firstEvidence.videoNumber
          );
        } else if (
          safeResult.videoResults
            .length
        ) {
          setActiveVideoNumber(
            safeResult
              .videoResults[0]
              .videoNumber
          );
        }
      } catch (error) {
        alert(
          error instanceof
          Error
            ? error.message
            : "Investigation failed."
        );
      } finally {
        setInvestigationLoading(
          false
        );
      }
    };

  /*
   * ACTIVE RESULT
   */

  const activeVideoResult =
    investigation?.videoResults.find(
      (
        item
      ) =>
        item.videoNumber ===
        activeVideoNumber
    ) || null;

  const activeMatches =
    activeVideoResult?.matches ||
    [];

  const selectedMatch =
    activeMatches[
      selectedMatchIndex
    ] || null;

  /*
   * SELECT VIDEO
   */

  const selectVideo =
    (videoNumber: number) => {
      setActiveVideoNumber(
        videoNumber
      );

      setSelectedMatchIndex(
        0
      );
    };

  /*
   * JUMP
   */

  const jumpToMatch =
    (
      videoNumber: number,
      matchIndex: number
    ) => {
      const result =
        investigation?.videoResults.find(
          (
            item
          ) =>
            item.videoNumber ===
            videoNumber
        );

      const match =
        result?.matches[
          matchIndex
        ];

      if (!result || !match) {
        return;
      }

      setMode("board");

      setActiveVideoNumber(
        videoNumber
      );

      setSelectedMatchIndex(
        matchIndex
      );

      window.setTimeout(
        () => {
          const video =
            videoRef.current;

          if (!video) {
            return;
          }

          const jump = () => {
            try {
              video.currentTime =
                match.startTime;

              video
                .play()
                .catch(
                  () => {}
                );
            } catch {
              // Ignore until metadata is ready.
            }
          };

          if (
            video.readyState >=
            1
          ) {
            jump();
          } else {
            video.addEventListener(
              "loadedmetadata",
              jump,
              {
                once: true,
              }
            );
          }
        },
        150
      );
    };

  /*
   * NOTES
   */

  const getMatchKey =
    (
      videoNumber: number,
      matchIndex: number
    ) =>
      `${videoNumber}-${matchIndex}`;

  const updateNote =
    (
      videoNumber: number,
      matchIndex: number,
      value: string
    ) => {
      const key =
        getMatchKey(
          videoNumber,
          matchIndex
        );

      setNotes(
        (current) => ({
          ...current,
          [key]: value,
        })
      );
    };

  const toggleReviewed =
    (
      videoNumber: number,
      matchIndex: number
    ) => {
      const key =
        getMatchKey(
          videoNumber,
          matchIndex
        );

      setReviewedMatches(
        (current) => ({
          ...current,
          [key]:
            !current[key],
        })
      );
    };

  /*
   * OCCURRENCES
   */

  const allOccurrences =
    useMemo(() => {
      if (!investigation) {
        return [];
      }

      return investigation.videoResults.flatMap(
        (
          video
        ) =>
          video.matches.map(
            (
              match,
              matchIndex
            ) => ({
              ...match,
              matchIndex,
            })
          )
      );
    }, [investigation]);

  /*
   * EXPORT
   */

  const exportCaseSummary =
    () => {
      if (!investigation) {
        return;
      }

      const report =
        {
          title:
            "Visual Evidence Search - Investigation Report",

          exportedAt:
            new Date().toISOString(),

          summary: {
            referenceCount:
              investigation.referenceCount,

            totalVideos:
              investigation.totalVideos,

            fullyMatchedVideos:
              investigation.matchedVideoCount,

            partiallyMatchedVideos:
              investigation.partialVideoCount,

            noMatchVideos:
              investigation.noMatchVideoCount,

            errorVideos:
              investigation.errorVideoCount,

            totalOccurrences:
              investigation.totalMatches,
          },

          references:
            references.map(
              (
                reference,
                index
              ) => ({
                referenceNumber:
                  index + 1,

                name:
                  reference.name,

                url:
                  reference.url ||
                  "",
              })
            ),

          targetProfile:
            investigation.referenceDescription,

          evidence:
            investigation.videoResults.map(
              (
                video
              ) => ({
                videoNumber:
                  video.videoNumber,

                videoName:
                  video.videoName,

                status:
                  video.status,

                matchedReferenceIndexes:
                  video.matchedReferenceIndexes,

                unmatchedReferenceIndexes:
                  video.unmatchedReferenceIndexes,

                occurrences:
                  video.matches.map(
                    (
                      match,
                      index
                    ) => ({
                      occurrence:
                        index + 1,

                      start:
                        formatSeconds(
                          match.startTime
                        ),

                      end:
                        formatSeconds(
                          match.endTime
                        ),

                      startSeconds:
                        match.startTime,

                      endSeconds:
                        match.endTime,

                      referenceMatches:
                        match.referenceMatches,

                      aiDescription:
                        match.transcript,

                      investigatorNote:
                        notes[
                          getMatchKey(
                            video.videoNumber,
                            index
                          )
                        ] ||
                        "",

                      reviewed:
                        Boolean(
                          reviewedMatches[
                            getMatchKey(
                              video.videoNumber,
                              index
                            )
                          ]
                        ),
                    })
                  ),

                error:
                  video.error ||
                  "",
              })
            ),
        };

      const blob =
        new Blob(
          [
            JSON.stringify(
              report,
              null,
              2
            ),
          ],
          {
            type:
              "application/json",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;

      link.download =
        "visual-evidence-investigation.json";

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      URL.revokeObjectURL(
        url
      );
    };

  /*
   * SUMMARY
   *
   * IMPORTANT:
   * The misleading "NO REFERENCE MATCH"
   * card has been removed.
   */

  const summaryCards =
    investigation
      ? [
          {
            label:
              "VIDEOS ANALYZED",

            value:
              investigation.totalVideos,

            type: "normal",
          },

          {
            label:
              "VIDEOS WITH EVIDENCE",

            value:
              investigation
                .matchedVideoCount +
              investigation
                .partialVideoCount,

            type: "green",
          },

          {
            label:
              "TOTAL OCCURRENCES",

            value:
              investigation.totalMatches,

            type: "yellow",
          },
        ]
      : [];

  /*
   * UI
   */

  return (
    <main className="app">
      <header className="hero">
        <div>
          <div className="eyebrow">
            VISUAL EVIDENCE SEARCH
          </div>

          <h1>
            Evidence
            <span>
              investigation
            </span>
          </h1>

          <p>
            Find the same visual target
            across CCTV evidence and
            review every appearance on
            an evidence board.
          </p>
        </div>

        <div className="powered">
          <span>
            Powered by
          </span>

          <strong>
            Cloudinary
          </strong>
        </div>
      </header>

      <nav className="mode-switch">
        <button
          className={
            mode === "image"
              ? "mode active"
              : "mode"
          }
          onClick={() =>
            setMode("image")
          }
        >
          IMAGE SEARCH
        </button>

        <button
          className={
            mode === "board"
              ? "mode active"
              : "mode"
          }
          onClick={() =>
            setMode("board")
          }
          disabled={!investigation}
        >
          EVIDENCE BOARD
        </button>
      </nav>

      {mode === "image" ? (
        <section className="page">
          <section className="card">
            <div className="section-head">
              <div>
                <div className="section-number">
                  01
                </div>

                <h2>
                  Reference pictures
                </h2>

                <p>
                  Upload multiple views of
                  the same target.
                </p>
              </div>

              <button
                className="button secondary"
                onClick={() =>
                  referenceInput.current?.click()
                }
              >
                + ADD REFERENCE
              </button>

              <input
                ref={
                  referenceInput
                }
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={
                  addReferences
                }
              />
            </div>

            <div className="reference-grid">
              {references.map(
                (
                  item,
                  index
                ) => (
                  <div
                    className="reference-card"
                    key={
                      item.id
                    }
                  >
                    <div className="reference-image">
                      {item.url ? (
                        <img
                          src={
                            item.url
                          }
                          alt={
                            item.name
                          }
                        />
                      ) : (
                        <div className="upload-state">
                          {item.status ===
                          "uploading"
                            ? "UPLOADING..."
                            : "ERROR"}
                        </div>
                      )}

                      <div className="reference-number">
                        REFERENCE{" "}
                        {index +
                          1}
                      </div>

                      <button
                        className="remove-button"
                        onClick={() =>
                          removeReference(
                            item.id
                          )
                        }
                      >
                        ×
                      </button>
                    </div>

                    <div className="reference-meta">
                      <strong>
                        {
                          item.name
                        }
                      </strong>

                      <span>
                        {formatBytes(
                          item.size
                        )}
                      </span>
                    </div>
                  </div>
                )
              )}

              <button
                className="add-reference-card"
                onClick={() =>
                  referenceInput.current?.click()
                }
              >
                <span className="plus">
                  +
                </span>

                <strong>
                  Add another view
                </strong>

                <span>
                  Use several angles or
                  appearances of the
                  same target.
                </span>
              </button>
            </div>

            <div className="description-block">
              <label>
                OPTIONAL TARGET DESCRIPTION
              </label>

              <textarea
                value={
                  targetDescription
                }
                onChange={(
                  event
                ) =>
                  setTargetDescription(
                    event.target.value
                  )
                }
                placeholder="Describe distinctive colors, logos, text, shape, markings or other visual features..."
              />
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <div>
                <div className="section-number">
                  02
                </div>

                <h2>
                  CCTV / video evidence
                </h2>

                <p>
                  Add as many videos as
                  your storage and service
                  limits allow.
                </p>
              </div>

              <button
                className="button secondary"
                onClick={() =>
                  videoInput.current?.click()
                }
              >
                + ADD VIDEOS
              </button>

              <input
                ref={
                  videoInput
                }
                hidden
                type="file"
                accept="video/*"
                multiple
                onChange={
                  addVideos
                }
              />
            </div>

            <div className="video-upload-list">
              {videos.map(
                (
                  video
                ) => (
                  <div
                    className="upload-video-row"
                    key={
                      video.id
                    }
                  >
                    <div className="video-number">
                      {
                        video.videoNumber
                      }
                    </div>

                    <div className="video-details">
                      <strong>
                        {
                          video.name
                        }
                      </strong>

                      <span>
                        {formatBytes(
                          video.size
                        )}
                      </span>
                    </div>

                    <div
                      className={`upload-status ${video.status}`}
                    >
                      {video.status ===
                      "uploading"
                        ? "UPLOADING..."
                        : video.status ===
                            "error"
                          ? "ERROR"
                          : "READY"}
                    </div>

                    <button
                      className="remove-inline"
                      onClick={() =>
                        removeVideo(
                          video.id
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                )
              )}

              {!videos.length ? (
                <button
                  className="empty-upload"
                  onClick={() =>
                    videoInput.current?.click()
                  }
                >
                  <strong>
                    + Add CCTV videos
                  </strong>

                  <span>
                    No 1–5 interface limit.
                    Add multiple videos.
                  </span>
                </button>
              ) : (
                <button
                  className="add-more-videos"
                  onClick={() =>
                    videoInput.current?.click()
                  }
                >
                  + ADD MORE VIDEOS
                </button>
              )}
            </div>
          </section>

          <section className="run-card">
            <div>
              <div className="section-number">
                03
              </div>

              <h2>
                Run image investigation
              </h2>

              <p>
                Compare every reference
                view against every
                uploaded video.
              </p>
            </div>

            <button
              className="button primary big-button"
              onClick={
                runInvestigation
              }
              disabled={
                investigationLoading
              }
            >
              {investigationLoading
                ? "ANALYZING EVIDENCE..."
                : "RUN IMAGE SEARCH"}
            </button>
          </section>

          {investigation ? (
            <section className="result-ready">
              <div>
                <div className="result-ready-label">
                  INVESTIGATION COMPLETE
                </div>

                <strong>
                  {
                    investigation.totalMatches
                  }{" "}
                  occurrence
                  {investigation.totalMatches ===
                  1
                    ? ""
                    : "s"}{" "}
                  found across{" "}
                  {investigation
                    .matchedVideoCount +
                    investigation
                      .partialVideoCount}{" "}
                  video
                  {investigation
                    .matchedVideoCount +
                    investigation
                      .partialVideoCount ===
                  1
                    ? ""
                    : "s"}
                </strong>
              </div>

              <button
                className="button primary"
                onClick={() =>
                  setMode("board")
                }
              >
                OPEN EVIDENCE BOARD →
              </button>
            </section>
          ) : null}
        </section>
      ) : (
        <section className="page board-page">
          {!investigation ? (
            <section className="empty-board">
              <div className="empty-board-icon">
                ◈
              </div>

              <h2>
                No investigation yet
              </h2>

              <p>
                Run Image Search first.
                The Evidence Board will
                organize every reference
                result and occurrence.
              </p>

              <button
                className="button primary"
                onClick={() =>
                  setMode("image")
                }
              >
                GO TO IMAGE SEARCH
              </button>
            </section>
          ) : (
            <>
              <section className="board-header card">
                <div>
                  <div className="board-eyebrow">
                    EVIDENCE BOARD
                  </div>

                  <h2>
                    Investigation summary
                  </h2>

                  <p>
                    Review the detected
                    reference matches and
                    video occurrences.
                  </p>
                </div>

                <div className="board-actions">
                  <button
                    className="button secondary"
                    onClick={() =>
                      setMode("image")
                    }
                  >
                    ← IMAGE SEARCH
                  </button>

                  <button
                    className="button primary"
                    onClick={
                      exportCaseSummary
                    }
                  >
                    EXPORT CASE SUMMARY
                  </button>
                </div>
              </section>

              <section className="summary-grid">
                {summaryCards.map(
                  (
                    card
                  ) => (
                    <div
                      className={`summary-card ${card.type}`}
                      key={
                        card.label
                      }
                    >
                      <span>
                        {
                          card.label
                        }
                      </span>

                      <strong>
                        {
                          card.value
                        }
                      </strong>
                    </div>
                  )
                )}
              </section>

              <section className="board-review">
                <div className="player-column">
                  <div className="panel-title">
                    <div>
                      <small>
                        SELECTED EVIDENCE
                      </small>

                      <h3>
                        {activeVideoResult
                          ? `VIDEO ${activeVideoResult.videoNumber}`
                          : "Select an occurrence"}
                      </h3>

                      {activeVideoResult ? (
                        <p>
                          {
                            activeVideoResult.videoName
                          }
                        </p>
                      ) : null}
                    </div>

                    {activeVideoResult ? (
                      <span
                        className={`status-pill ${activeVideoResult.status}`}
                      >
                        {activeVideoResult.status ===
                        "matched"
                          ? "✓ FULL MATCH"
                          : activeVideoResult.status ===
                              "partial"
                            ? `✓ ${activeVideoResult.matchedReferenceIndexes.length} / ${investigation.referenceCount} REFERENCES`
                            : activeVideoResult.status ===
                                "no-match"
                              ? "✕ NO MATCH"
                              : "⚠ ERROR"}
                      </span>
                    ) : null}
                  </div>

                  <div className="large-player">
                    {activeVideoResult ? (
                      <video
                        ref={
                          videoRef
                        }
                        className="video-element"
                        controls
                        preload="metadata"
                        src={
                          activeVideoResult.videoUrl
                        }
                      />
                    ) : (
                      <div className="player-empty">
                        <strong>
                          Select an occurrence
                        </strong>

                        <span>
                          Your selected match
                          will appear here.
                        </span>
                      </div>
                    )}

                    {selectedMatch ? (
                      <div className="player-match-overlay">
                        <span>
                          MATCH START
                        </span>

                        <strong>
                          {formatSeconds(
                            selectedMatch.startTime
                          )}
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  {selectedMatch ? (
                    <div className="selected-occurrence">
                      <div className="selected-occurrence-head">
                        <div>
                          <small>
                            SELECTED OCCURRENCE
                          </small>

                          <h3>
                            {formatSeconds(
                              selectedMatch.startTime
                            )}{" "}
                            <span>
                              →
                            </span>{" "}
                            {formatSeconds(
                              selectedMatch.endTime
                            )}
                          </h3>
                        </div>

                        <button
                          className="jump-large"
                          onClick={() =>
                            jumpToMatch(
                              selectedMatch.videoNumber,
                              selectedMatchIndex
                            )
                          }
                        >
                          ▶ JUMP TO THIS MATCH
                        </button>
                      </div>

                      <div className="occurrence-reference-summary">
                        <div>
                          <span>
                            MATCHED REFERENCES
                          </span>

                          <strong>
                            {(
                              selectedMatch.referenceMatches ||
                              []
                            ).filter(
                              (
                                item
                              ) =>
                                item.matched
                            ).length}
                            /
                            {
                              investigation.referenceCount
                            }
                          </strong>
                        </div>

                        <div className="mini-reference-row">
                          {(
                            selectedMatch.referenceMatches ||
                            []
                          )
                            .filter(
                              (
                                item
                              ) =>
                                item.matched
                            )
                            .map(
                              (
                                item
                              ) => {
                                const ref =
                                  references[
                                    item.referenceIndex -
                                      1
                                  ];

                                return ref?.url ? (
                                  <img
                                    key={
                                      item.referenceIndex
                                    }
                                    src={
                                      ref.url
                                    }
                                    alt={`Reference ${item.referenceIndex}`}
                                  />
                                ) : null;
                              }
                            )}
                        </div>
                      </div>

                      <p className="ai-description">
                        {
                          selectedMatch.transcript
                        }
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="occurrence-column">
                  <div className="panel-title occurrence-heading">
                    <div>
                      <small>
                        FINDINGS
                      </small>

                      <h3>
                        Reference results
                      </h3>

                      <p>
                        Detected reference
                        matches and video
                        occurrences are shown
                        below.
                      </p>
                    </div>
                  </div>

                  <div className="occurrence-scroll">
                    {investigation.videoResults.map(
                      (
                        result
                      ) => (
                        <div
                          className={`video-finding ${result.status} ${
                            activeVideoNumber ===
                            result.videoNumber
                              ? "active-video"
                              : ""
                          }`}
                          key={
                            result.videoNumber
                          }
                        >
                          <button
                            className="video-finding-header"
                            onClick={() =>
                              selectVideo(
                                result.videoNumber
                              )
                            }
                          >
                            <div className="finding-video-number">
                              {
                                result.videoNumber
                              }
                            </div>

                            <div className="finding-video-info">
                              <strong>
                                VIDEO{" "}
                                {
                                  result.videoNumber
                                }
                              </strong>

                              <span>
                                {
                                  result.videoName
                                }
                              </span>

                              <div
                                className={`finding-status ${result.status}`}
                              >
                                {result.status ===
                                "matched"
                                  ? `✓ ALL ${investigation.referenceCount} REFERENCES MATCHED`
                                  : result.status ===
                                      "partial"
                                    ? `✓ ${result.matchedReferenceIndexes.length} OF ${investigation.referenceCount} REFERENCES MATCHED`
                                    : result.status ===
                                        "no-match"
                                      ? `✕ 0 OF ${investigation.referenceCount} REFERENCES MATCHED`
                                      : "⚠ ANALYSIS ERROR"}
                              </div>
                            </div>

                            <span className="chevron">
                              →
                            </span>
                          </button>

                          {result.matchedReferenceIndexes
                            .length >
                          0 ? (
                            <div className="reference-result-section matched-section">
                              <div className="reference-section-title">
                                <div>
                                  <span className="status-icon green">
                                    ✓
                                  </span>

                                  <div>
                                    <strong>
                                      MATCHED REFERENCES
                                    </strong>

                                    <small>
                                      {
                                        result
                                          .matchedReferenceIndexes
                                          .length
                                      }{" "}
                                      supported
                                    </small>
                                  </div>
                                </div>
                              </div>

                              <div className="reference-result-grid">
                                {result.matchedReferenceIndexes.map(
                                  (
                                    referenceIndex
                                  ) => {
                                    const reference =
                                      references[
                                        referenceIndex -
                                          1
                                      ];

                                    return (
                                      <div
                                        className="result-reference matched"
                                        key={
                                          referenceIndex
                                        }
                                      >
                                        <div className="result-reference-image">
                                          {reference?.url ? (
                                            <img
                                              src={
                                                reference.url
                                              }
                                              alt={`Reference ${referenceIndex}`}
                                            />
                                          ) : null}

                                          <div className="result-reference-badge">
                                            ✓ MATCH
                                          </div>
                                        </div>

                                        <strong>
                                          REFERENCE{" "}
                                          {
                                            referenceIndex
                                          }
                                        </strong>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          ) : null}

                          {result.matches
                            .length >
                          0 ? (
                            <div className="occurrences">
                              <div className="occurrences-label">
                                <span>
                                  TARGET APPEARS HERE
                                </span>

                                <strong>
                                  {
                                    result
                                      .matches
                                      .length
                                  }{" "}
                                  APPEARANCE
                                  {result
                                    .matches
                                    .length ===
                                  1
                                    ? ""
                                    : "S"}
                                </strong>
                              </div>

                              {result.matches.map(
                                (
                                  match,
                                  matchIndex
                                ) => {
                                  const selected =
                                    activeVideoNumber ===
                                      result.videoNumber &&
                                    selectedMatchIndex ===
                                      matchIndex;

                                  return (
                                    <div
                                      className={
                                        selected
                                          ? "occurrence-card selected"
                                          : "occurrence-card"
                                      }
                                      key={`${result.videoNumber}-${matchIndex}`}
                                    >
                                      <div className="occurrence-card-top">
                                        <div className="occurrence-count">
                                          {
                                            matchIndex +
                                              1
                                          }
                                        </div>

                                        <div className="occurrence-card-text">
                                          <strong>
                                            OCCURRENCE{" "}
                                            {
                                              matchIndex +
                                                1
                                            }
                                          </strong>

                                          <span>
                                            Target visible
                                            in this
                                            interval
                                          </span>
                                        </div>

                                        <div className="occurrence-time">
                                          <strong>
                                            {formatSeconds(
                                              match.startTime
                                            )}
                                          </strong>

                                          <span>
                                            →
                                          </span>

                                          <strong>
                                            {formatSeconds(
                                              match.endTime
                                            )}
                                          </strong>
                                        </div>
                                      </div>

                                      <div className="occurrence-supported">
                                        <span>
                                          REFERENCES:
                                        </span>

                                        {(
                                          match.referenceMatches ||
                                          []
                                        )
                                          .filter(
                                            (
                                              item
                                            ) =>
                                              item.matched
                                          )
                                          .map(
                                            (
                                              item
                                            ) => (
                                              <b
                                                key={
                                                  item.referenceIndex
                                                }
                                              >
                                                ✓ R
                                                {
                                                  item.referenceIndex
                                                }
                                              </b>
                                            )
                                          )}

                                        {(
                                          match.referenceMatches ||
                                          []
                                        )
                                          .filter(
                                            (
                                              item
                                            ) =>
                                              !item.matched
                                          )
                                          .map(
                                            (
                                              item
                                            ) => (
                                              <i
                                                key={
                                                  item.referenceIndex
                                                }
                                              >
                                                ✕ R
                                                {
                                                  item.referenceIndex
                                                }
                                              </i>
                                            )
                                          )}
                                      </div>

                                      <button
                                        className="jump-button"
                                        onClick={() =>
                                          jumpToMatch(
                                            result.videoNumber,
                                            matchIndex
                                          )
                                        }
                                      >
                                        ▶ JUMP TO THIS
                                        MATCH
                                      </button>

                                      {selected ? (
                                        <div className="currently-selected">
                                          ● CURRENTLY
                                          SELECTED
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          ) : null}

                          {result.status ===
                          "error" ? (
                            <div className="finding-error">
                              {
                                result.error
                              }
                            </div>
                          ) : null}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </section>

              <section className="card timeline-card">
                <div className="timeline-heading">
                  <div>
                    <small>
                      INVESTIGATION TIMELINE
                    </small>

                    <h2>
                      Every detected
                      occurrence
                    </h2>

                    <p>
                      Click a marker to jump
                      directly to the match.
                    </p>
                  </div>
                </div>

                <div className="all-timelines">
                  {investigation.videoResults.map(
                    (
                      result
                    ) => {
                      const maxTime =
                        Math.max(
                          60,
                          ...result.matches.map(
                            (
                              match
                            ) =>
                              match.endTime
                          )
                        );

                      return (
                        <div
                          className="timeline-row"
                          key={
                            result.videoNumber
                          }
                        >
                          <div className="timeline-video-name">
                            <strong>
                              VIDEO{" "}
                              {
                                result.videoNumber
                              }
                            </strong>

                            <span>
                              {
                                result.videoName
                              }
                            </span>
                          </div>

                          <div className="timeline-track">
                            <div className="timeline-line" />

                            {result.matches.map(
                              (
                                match,
                                index
                              ) => {
                                const left =
                                  Math.min(
                                    96,
                                    Math.max(
                                      4,
                                      (match.startTime /
                                        maxTime) *
                                        100
                                    )
                                  );

                                return (
                                  <button
                                    key={`${result.videoNumber}-${index}`}
                                    className={
                                      activeVideoNumber ===
                                        result.videoNumber &&
                                      selectedMatchIndex ===
                                        index
                                        ? "timeline-dot selected"
                                        : "timeline-dot"
                                    }
                                    style={{
                                      left: `${left}%`,
                                    }}
                                    onClick={() =>
                                      jumpToMatch(
                                        result.videoNumber,
                                        index
                                      )
                                    }
                                    title={`VIDEO ${result.videoNumber} — ${formatSeconds(
                                      match.startTime
                                    )} to ${formatSeconds(
                                      match.endTime
                                    )}`}
                                  >
                                    <span>
                                      {formatSeconds(
                                        match.startTime
                                      )}
                                    </span>
                                  </button>
                                );
                              }
                            )}
                          </div>

                          <div className="timeline-end">
                            {formatSeconds(
                              maxTime
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </section>

              <section className="card">
                <div className="timeline-heading">
                  <div>
                    <small>
                      REFERENCE LIBRARY
                    </small>

                    <h2>
                      All reference images
                    </h2>

                    <p>
                      Every reference used
                      in this investigation.
                    </p>
                  </div>
                </div>

                <div className="comparison-grid">
                  {references.map(
                    (
                      reference,
                      index
                    ) => (
                      <div
                        className="comparison-card"
                        key={
                          reference.id
                        }
                      >
                        <div className="comparison-label">
                          REFERENCE{" "}
                          {index +
                            1}
                        </div>

                        <div className="comparison-image">
                          {reference.url ? (
                            <img
                              src={
                                reference.url
                              }
                              alt={
                                reference.name
                              }
                            />
                          ) : null}
                        </div>

                        <strong>
                          {
                            reference.name
                          }
                        </strong>
                      </div>
                    )
                  )}
                </div>
              </section>

              <section className="card">
                <div className="timeline-heading">
                  <div>
                    <small>
                      INVESTIGATOR NOTES
                    </small>

                    <h2>
                      Review each occurrence
                    </h2>

                    <p>
                      Add observations to
                      specific evidence
                      moments.
                    </p>
                  </div>
                </div>

                <div className="notes-grid">
                  {allOccurrences.map(
                    (
                      occurrence
                    ) => {
                      const key =
                        getMatchKey(
                          occurrence.videoNumber,
                          occurrence.matchIndex
                        );

                      const reviewed =
                        Boolean(
                          reviewedMatches[
                            key
                          ]
                        );

                      return (
                        <div
                          className={
                            reviewed
                              ? "note-card reviewed"
                              : "note-card"
                          }
                          key={
                            key
                          }
                        >
                          <div className="note-header">
                            <div>
                              <strong>
                                VIDEO{" "}
                                {
                                  occurrence.videoNumber
                                }
                              </strong>

                              <span>
                                OCCURRENCE{" "}
                                {
                                  occurrence.matchIndex +
                                    1
                                }
                              </span>
                            </div>

                            <span className="note-time">
                              {formatSeconds(
                                occurrence.startTime
                              )}{" "}
                              →
                              {" "}
                              {formatSeconds(
                                occurrence.endTime
                              )}
                            </span>
                          </div>

                          <textarea
                            value={
                              notes[
                                key
                              ] || ""
                            }
                            onChange={(
                              event
                            ) =>
                              updateNote(
                                occurrence.videoNumber,
                                occurrence.matchIndex,
                                event.target.value
                              )
                            }
                            placeholder="Add an observation, identifying detail, or follow-up note..."
                          />

                          <button
                            className={
                              reviewed
                                ? "review-button checked"
                                : "review-button"
                            }
                            onClick={() =>
                              toggleReviewed(
                                occurrence.videoNumber,
                                occurrence.matchIndex
                              )
                            }
                          >
                            {reviewed
                              ? "✓ REVIEWED"
                              : "MARK AS REVIEWED"}
                          </button>
                        </div>
                      );
                    }
                  )}

                  {!allOccurrences.length ? (
                    <div className="no-occurrences">
                      No target occurrences were
                      detected.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="profile-card">
                <small>
                  AI TARGET PROFILE
                </small>

                <p>
                  {
                    investigation.referenceDescription
                  }
                </p>
              </section>
            </>
          )}
        </section>
      )}

      <footer>
        <span>
          Visual Evidence Search
        </span>

        <span>
          Visual investigation ·
          Evidence board
        </span>

        <strong>
          Powered by Cloudinary
        </strong>
      </footer>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #06090d;
          color: #edf2f7;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }

        body {
          min-width: 320px;
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .app {
          min-height: 100vh;
          padding: 38px 42px 60px;
          background:
            radial-gradient(
              circle at 10% 0%,
              rgba(64, 125, 255, 0.11),
              transparent 32%
            ),
            #06090d;
        }

        .hero,
        .page,
        .mode-switch,
        footer {
          width: 100%;
          max-width: 1500px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 30px;
          margin-bottom: 26px;
        }

        .eyebrow,
        small,
        .section-number,
        .board-eyebrow {
          color: #8490a2;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .hero h1 {
          margin: 10px 0 8px;
          font-size: 48px;
          line-height: 0.95;
          letter-spacing: -0.045em;
        }

        .hero h1 span {
          display: block;
          color: #aab5c5;
        }

        .hero p {
          max-width: 730px;
          margin: 0;
          color: #929dad;
          font-size: 15px;
          line-height: 1.6;
        }

        .powered {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 15px;
          border: 1px solid
            rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          background: #0d1218;
          white-space: nowrap;
        }

        .powered span {
          color: #778396;
          font-size: 11px;
        }

        .powered strong,
        footer strong {
          color: #8dde43;
          font-size: 13px;
        }

        .mode-switch {
          display: flex;
          gap: 9px;
          margin-bottom: 20px;
        }

        .mode {
          min-height: 48px;
          padding: 13px 22px;
          border: 1px solid
            rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          background: #0c1219;
          color: #a8b2c0;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .mode:hover:not(:disabled) {
          border-color: #66768c;
        }

        .mode.active {
          background: #e7edf6;
          color: #101721;
        }

        .page {
          position: relative;
        }

        .card,
        .run-card,
        .empty-board,
        .result-ready,
        .profile-card {
          border: 1px solid
            rgba(255, 255, 255, 0.09);
          border-radius: 16px;
          background: #0b1016;
        }

        .card {
          margin-bottom: 18px;
          padding: 23px;
        }

        .section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        h2 {
          margin: 6px 0 5px;
          font-size: 23px;
          line-height: 1.15;
        }

        .section-head p,
        .run-card p,
        .board-header p,
        .timeline-heading p,
        .panel-title p,
        .empty-board p {
          margin: 0;
          color: #929dac;
          font-size: 13px;
          line-height: 1.55;
        }

        .button {
          min-height: 42px;
          padding: 11px 16px;
          border-radius: 9px;
          border: 1px solid
            rgba(255, 255, 255, 0.12);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .button.primary {
          background: #e8eef7;
          color: #111822;
        }

        .button.secondary {
          background: #151c25;
          color: #e4eaf2;
        }

        .big-button {
          min-width: 220px;
          min-height: 50px;
        }

        .reference-grid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fill,
              minmax(205px, 1fr)
            );
          gap: 12px;
        }

        .reference-card,
        .add-reference-card {
          min-width: 0;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          background: #080d13;
          overflow: hidden;
        }

        .reference-image {
          position: relative;
          height: 145px;
          background: #020407;
        }

        .reference-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .reference-number {
          position: absolute;
          top: 9px;
          left: 9px;
          padding: 5px 7px;
          border-radius: 6px;
          background: rgba(
            0,
            0,
            0,
            0.72
          );
          color: #8dde43;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.09em;
        }

        .upload-state {
          height: 100%;
          display: grid;
          place-items: center;
          color: #7f8b9b;
          font-size: 10px;
          font-weight: 900;
        }

        .remove-button {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 27px;
          height: 27px;
          border: 0;
          border-radius: 50%;
          background: rgba(
            0,
            0,
            0,
            0.72
          );
          color: white;
          font-size: 18px;
        }

        .remove-button:hover,
        .remove-inline:hover {
          background: #d74444;
        }

        .reference-meta {
          padding: 11px;
        }

        .reference-meta strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #e0e7ef;
          font-size: 12px;
        }

        .reference-meta span {
          display: block;
          margin-top: 4px;
          color: #6f7b8b;
          font-size: 10px;
        }

        .add-reference-card {
          min-height: 181px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 7px;
          padding: 20px;
          color: #d0d9e4;
        }

        .add-reference-card:hover {
          border-color: #56667b;
        }

        .add-reference-card .plus {
          font-size: 27px;
          color: #8dde43;
        }

        .add-reference-card span:last-child {
          max-width: 180px;
          color: #697688;
          font-size: 10px;
          line-height: 1.45;
          text-align: center;
        }

        .description-block {
          margin-top: 20px;
        }

        label {
          display: block;
          margin-bottom: 8px;
          color: #7e8b9e;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.11em;
        }

        textarea {
          width: 100%;
          resize: vertical;
          padding: 13px;
          border: 1px solid
            rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          outline: none;
          background: #080d13;
          color: white;
          line-height: 1.5;
          font-size: 13px;
        }

        textarea:focus {
          border-color: #64758d;
        }

        .description-block textarea {
          min-height: 95px;
        }

        .video-upload-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .upload-video-row {
          display: grid;
          grid-template-columns:
            40px minmax(0, 1fr)
            auto 28px;
          align-items: center;
          gap: 12px;
          padding: 10px;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: #080d13;
        }

        .video-number {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #171e28;
          color: #e8edf4;
          font-size: 11px;
          font-weight: 900;
        }

        .video-details {
          min-width: 0;
        }

        .video-details strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #dce4ed;
          font-size: 12px;
        }

        .video-details span {
          display: block;
          margin-top: 4px;
          color: #6e7a8c;
          font-size: 10px;
        }

        .upload-status {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .upload-status.ready {
          color: #4be18b;
        }

        .upload-status.uploading {
          color: #c5b04c;
        }

        .upload-status.error {
          color: #ff6f6f;
        }

        .remove-inline {
          width: 27px;
          height: 27px;
          border: 0;
          border-radius: 50%;
          background: #161c23;
          color: #d8e0e9;
          font-size: 17px;
        }

        .empty-upload {
          min-height: 110px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 7px;
          border: 1px dashed #384453;
          border-radius: 11px;
          background: #080d13;
          color: #d1dae5;
        }

        .empty-upload span {
          color: #697688;
          font-size: 11px;
        }

        .add-more-videos {
          align-self: flex-start;
          padding: 9px 12px;
          border: 1px solid
            rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background: #151c25;
          color: #b9c4d1;
          font-size: 10px;
          font-weight: 900;
        }

        .run-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 25px;
          margin-bottom: 18px;
          padding: 22px;
        }

        .result-ready {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 18px;
          padding: 17px 19px;
          background: rgba(
            65,
            192,
            112,
            0.08
          );
          border-color: rgba(
            75,
            225,
            139,
            0.24
          );
        }

        .result-ready-label {
          color: #4be18b;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .result-ready strong {
          display: block;
          margin-top: 5px;
          color: #dce8df;
          font-size: 14px;
        }

        .empty-board {
          min-height: 530px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
          text-align: center;
        }

        .empty-board-icon {
          width: 60px;
          height: 60px;
          display: grid;
          place-items: center;
          margin-bottom: 14px;
          border-radius: 16px;
          background: #121a23;
          color: #8dde43;
          font-size: 28px;
        }

        .empty-board p {
          max-width: 530px;
          margin-bottom: 22px;
        }

        .board-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .board-header h2 {
          font-size: 28px;
        }

        .board-actions {
          display: flex;
          gap: 8px;
        }

        .summary-grid {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 18px;
        }

        .summary-card {
          min-height: 110px;
          padding: 18px;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 13px;
          background: #0b1016;
        }

        .summary-card span {
          display: block;
          color: #778395;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .summary-card strong {
          display: block;
          margin-top: 12px;
          color: #eef3f8;
          font-size: 34px;
        }

        .summary-card.green strong {
          color: #4be18b;
        }

        .summary-card.yellow strong {
          color: #ffe04d;
        }

        .board-review {
          display: grid;
          grid-template-columns:
            minmax(0, 1.6fr)
            minmax(390px, 0.9fr);
          min-height: 810px;
          margin-bottom: 18px;
          border: 1px solid
            rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          overflow: hidden;
          background: #080d13;
        }

        .player-column {
          min-width: 0;
          padding: 20px;
          border-right: 1px solid
            rgba(255, 255, 255, 0.08);
        }

        .occurrence-column {
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #090e14;
        }

        .panel-title {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 15px;
          margin-bottom: 14px;
        }

        .panel-title h3 {
          margin: 5px 0 4px;
          font-size: 20px;
        }

        .panel-title p {
          max-width: 620px;
          overflow: hidden;
          color: #6f7b8c;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .status-pill {
          padding: 8px 11px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 900;
          white-space: nowrap;
        }

        .status-pill.matched,
        .status-pill.partial {
          color: #4be18b;
          background: rgba(
            75,
            225,
            139,
            0.1
          );
        }

        .status-pill.no-match,
        .status-pill.error {
          color: #ff6c6c;
          background: rgba(
            255,
            70,
            70,
            0.09
          );
        }

        .large-player {
          position: relative;
          width: 100%;
          overflow: hidden;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 13px;
          background: #000;
        }

        .video-element {
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          min-height: 300px;
          max-height: 560px;
          background: #000;
        }

        .player-empty {
          min-height: 480px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 8px;
          color: #8390a0;
          text-align: center;
        }

        .player-empty strong {
          color: #cad3de;
        }

        .player-empty span {
          font-size: 11px;
        }

        .player-match-overlay {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(
            0,
            0,
            0,
            0.8
          );
          pointer-events: none;
        }

        .player-match-overlay span {
          color: #8dde43;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .player-match-overlay strong {
          color: #ffe04d;
          font-family: Consolas, monospace;
          font-size: 11px;
        }

        .selected-occurrence {
          margin-top: 14px;
          padding: 15px;
          border: 1px solid
            rgba(75, 225, 139, 0.22);
          border-radius: 11px;
          background: rgba(
            40,
            176,
            92,
            0.05
          );
        }

        .selected-occurrence-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
        }

        .selected-occurrence h3 {
          margin: 6px 0 0;
          color: #ffe04d;
          font-family: Consolas, monospace;
          font-size: 19px;
        }

        .selected-occurrence h3 span {
          color: #687787;
        }

        .jump-large {
          padding: 10px 12px;
          border: 1px solid
            rgba(75, 225, 139, 0.3);
          border-radius: 8px;
          background: #173121;
          color: #66ef9b;
          font-size: 9px;
          font-weight: 900;
        }

        .jump-large:hover,
        .jump-button:hover {
          background: #20472d;
        }

        .occurrence-reference-summary {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-top: 13px;
          padding: 10px;
          border-radius: 8px;
          background: rgba(
            255,
            255,
            255,
            0.025
          );
        }

        .occurrence-reference-summary
          > div:first-child {
          display: flex;
          flex-direction: column;
          min-width: 110px;
        }

        .occurrence-reference-summary span {
          color: #768493;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .occurrence-reference-summary strong {
          margin-top: 4px;
          color: #4be18b;
          font-size: 14px;
        }

        .mini-reference-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .mini-reference-row img {
          width: 52px;
          height: 42px;
          object-fit: contain;
          border: 2px solid
            #4be18b;
          border-radius: 5px;
          background: #020407;
        }

        .ai-description {
          margin: 12px 0 0;
          color: #a9b4c1;
          font-size: 12px;
          line-height: 1.55;
        }

        .occurrence-heading {
          margin: 0;
          padding: 19px;
          border-bottom: 1px solid
            rgba(255, 255, 255, 0.07);
        }

        .occurrence-scroll {
          flex: 1;
          overflow-y: auto;
        }

        .video-finding {
          border-bottom: 1px solid
            rgba(255, 255, 255, 0.06);
        }

        .video-finding.active-video {
          background: rgba(
            255,
            255,
            255,
            0.025
          );
        }

        .video-finding.active-video.matched,
        .video-finding.active-video.partial {
          border-left: 3px solid
            #4be18b;
        }

        .video-finding.active-video.no-match,
        .video-finding.active-video.error {
          border-left: 3px solid
            #ff6666;
        }

        .video-finding-header {
          width: 100%;
          display: grid;
          grid-template-columns:
            36px minmax(0, 1fr)
            18px;
          gap: 10px;
          align-items: flex-start;
          padding: 14px;
          border: 0;
          background: transparent;
          color: white;
          text-align: left;
        }

        .video-finding-header:hover {
          background: rgba(
            255,
            255,
            255,
            0.025
          );
        }

        .finding-video-number {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: #171f29;
          color: white;
          font-size: 11px;
          font-weight: 900;
        }

        .finding-video-info {
          min-width: 0;
        }

        .finding-video-info strong {
          display: block;
          font-size: 12px;
        }

        .finding-video-info > span {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          color: #697688;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 9px;
        }

        .finding-status {
          margin-top: 8px;
          font-size: 9px;
          font-weight: 900;
        }

        .finding-status.matched,
        .finding-status.partial {
          color: #4be18b;
        }

        .finding-status.no-match,
        .finding-status.error {
          color: #ff6a6a;
        }

        .chevron {
          padding-top: 3px;
          color: #5f6b7b;
          font-size: 16px;
        }

        .reference-result-section {
          margin: 0 12px 12px 58px;
          padding: 10px;
          border: 1px solid;
          border-radius: 9px;
        }

        .matched-section {
          border-color: rgba(
            75,
            225,
            139,
            0.2
          );
          background: rgba(
            75,
            225,
            139,
            0.035
          );
        }

        .reference-section-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 9px;
        }

        .reference-section-title
          > div {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-icon {
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 900;
        }

        .status-icon.green {
          background: rgba(
            75,
            225,
            139,
            0.1
          );
          color: #4be18b;
        }

        .reference-section-title strong {
          display: block;
          color: #dce5ed;
          font-size: 9px;
          letter-spacing: 0.03em;
        }

        .reference-section-title small {
          display: block;
          margin-top: 3px;
          color: #6e7a8b;
          font-size: 7px;
          letter-spacing: 0;
        }

        .reference-result-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 7px;
        }

        .result-reference {
          min-width: 0;
          overflow: hidden;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 7px;
          background: #080d13;
        }

        .result-reference.matched {
          border-color: rgba(
            75,
            225,
            139,
            0.32
          );
        }

        .result-reference-image {
          position: relative;
          height: 82px;
          background: #020407;
        }

        .result-reference-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .result-reference-badge {
          position: absolute;
          right: 5px;
          bottom: 5px;
          padding: 4px 5px;
          border-radius: 5px;
          background: rgba(
            0,
            0,
            0,
            0.78
          );
          font-size: 7px;
          font-weight: 900;
        }

        .result-reference.matched
          .result-reference-badge {
          color: #4be18b;
        }

        .result-reference
          > strong {
          display: block;
          padding: 7px;
          color: #bfc9d5;
          font-size: 8px;
        }

        .occurrences {
          margin: 0 12px 13px 58px;
          padding: 10px;
          border: 1px solid
            rgba(255, 224, 77, 0.13);
          border-radius: 9px;
          background: rgba(
            255,
            224,
            77,
            0.018
          );
        }

        .occurrences-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .occurrences-label span {
          color: #938e73;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .occurrences-label strong {
          color: #ffe04d;
          font-size: 9px;
        }

        .occurrence-card {
          margin-top: 7px;
          padding: 10px;
          border: 1px solid
            rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          background: #0a1015;
        }

        .occurrence-card.selected {
          border-color: #ffe04d;
          background: rgba(
            255,
            224,
            77,
            0.06
          );
          box-shadow:
            0 0 0 1px
            rgba(
              255,
              224,
              77,
              0.08
            );
        }

        .occurrence-card-top {
          display: grid;
          grid-template-columns:
            27px minmax(0, 1fr)
            auto;
          gap: 8px;
          align-items: center;
        }

        .occurrence-count {
          width: 27px;
          height: 27px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          background: #17231c;
          color: #4be18b;
          font-size: 10px;
          font-weight: 900;
        }

        .occurrence-card-text strong {
          display: block;
          color: #e4ebe7;
          font-size: 9px;
        }

        .occurrence-card-text span {
          display: block;
          margin-top: 3px;
          color: #687586;
          font-size: 8px;
        }

        .occurrence-time {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 7px;
          border-radius: 6px;
          background: #111914;
          white-space: nowrap;
        }

        .occurrence-time strong {
          color: #ffe04d;
          font-family: Consolas, monospace;
          font-size: 10px;
        }

        .occurrence-time span {
          color: #718078;
          font-size: 10px;
        }

        .occurrence-supported {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 5px;
          margin-top: 8px;
        }

        .occurrence-supported
          > span {
          margin-right: 2px;
          color: #687586;
          font-size: 7px;
          font-weight: 900;
        }

        .occurrence-supported b,
        .occurrence-supported i {
          padding: 4px 6px;
          border-radius: 5px;
          font-size: 7px;
          font-style: normal;
          font-weight: 900;
        }

        .occurrence-supported b {
          background: rgba(
            75,
            225,
            139,
            0.1
          );
          color: #4be18b;
        }

        .occurrence-supported i {
          background: rgba(
            255,
            90,
            90,
            0.1
          );
          color: #ff7070;
        }

        .jump-button {
          width: 100%;
          margin-top: 9px;
          padding: 9px 8px;
          border: 1px solid
            rgba(75, 225, 139, 0.28);
          border-radius: 7px;
          background: #153120;
          color: #65eb99;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .currently-selected {
          margin-top: 7px;
          padding-top: 7px;
          border-top: 1px solid
            rgba(255, 224, 77, 0.14);
          color: #ffe04d;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .finding-error {
          margin: 0 12px 12px 58px;
          padding: 9px;
          border-radius: 7px;
          background: rgba(
            155,
            32,
            32,
            0.1
          );
          color: #ff7777;
          font-size: 9px;
          line-height: 1.4;
        }

        .timeline-card {
          padding: 22px;
        }

        .timeline-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .timeline-heading h2 {
          margin-top: 6px;
        }

        .all-timelines {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .timeline-row {
          display: grid;
          grid-template-columns:
            210px minmax(0, 1fr)
            60px;
          gap: 16px;
          align-items: center;
          padding: 12px;
          border: 1px solid
            rgba(255, 255, 255, 0.07);
          border-radius: 10px;
          background: #080d13;
        }

        .timeline-video-name strong {
          display: block;
          font-size: 10px;
        }

        .timeline-video-name span {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          color: #697688;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 8px;
        }

        .timeline-track {
          position: relative;
          height: 55px;
        }

        .timeline-line {
          position: absolute;
          left: 2%;
          right: 2%;
          top: 27px;
          height: 4px;
          border-radius: 999px;
          background: #28313d;
        }

        .timeline-dot {
          position: absolute;
          top: 20px;
          width: 18px;
          height: 18px;
          padding: 0;
          transform: translateX(-50%);
          border: 3px solid #121a14;
          border-radius: 50%;
          background: #55e48b;
          box-shadow:
            0 0 0 1px
            rgba(
              75,
              225,
              139,
              0.15
            );
          z-index: 2;
        }

        .timeline-dot:hover,
        .timeline-dot.selected {
          width: 22px;
          height: 22px;
          top: 18px;
          background: #ffe04d;
          box-shadow:
            0 0 0 5px
            rgba(
              255,
              224,
              77,
              0.12
            );
        }

        .timeline-dot span {
          position: absolute;
          bottom: 23px;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          color: #bac4d1;
          font-family: Consolas, monospace;
          font-size: 7px;
          font-weight: 900;
        }

        .timeline-end {
          color: #657183;
          font-family: Consolas, monospace;
          font-size: 9px;
          text-align: right;
        }

        .comparison-grid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fill,
              minmax(170px, 1fr)
            );
          gap: 10px;
        }

        .comparison-card {
          padding: 10px;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 9px;
          background: #080d13;
        }

        .comparison-label {
          margin-bottom: 7px;
          color: #8793a4;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .comparison-image {
          height: 130px;
          border-radius: 7px;
          overflow: hidden;
          background: #020407;
        }

        .comparison-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .comparison-card strong {
          display: block;
          margin-top: 8px;
          overflow: hidden;
          color: #d2dae4;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
        }

        .notes-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 11px;
        }

        .note-card {
          padding: 13px;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: #080d13;
        }

        .note-card.reviewed {
          border-color: rgba(
            75,
            225,
            139,
            0.3
          );
        }

        .note-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 9px;
        }

        .note-header > div {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .note-header strong {
          color: #e1e8f0;
          font-size: 10px;
        }

        .note-header span {
          color: #697688;
          font-size: 8px;
        }

        .note-time {
          color: #ffe04d !important;
          font-family: Consolas, monospace;
          font-size: 9px !important;
          white-space: nowrap;
        }

        .note-card textarea {
          min-height: 90px;
        }

        .review-button {
          margin-top: 8px;
          padding: 8px 9px;
          border: 1px solid
            rgba(255, 255, 255, 0.08);
          border-radius: 7px;
          background: #141b24;
          color: #9faaba;
          font-size: 8px;
          font-weight: 900;
        }

        .review-button.checked {
          border-color: rgba(
            75,
            225,
            139,
            0.28
          );
          background: #16301f;
          color: #61e997;
        }

        .no-occurrences {
          padding: 30px;
          color: #737f90;
          font-size: 12px;
          text-align: center;
        }

        .profile-card {
          margin-bottom: 18px;
          padding: 17px;
          background: #090e14;
        }

        .profile-card p {
          margin: 9px 0 0;
          color: #aeb8c5;
          font-size: 12px;
          line-height: 1.6;
        }

        footer {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          margin-top: 22px;
          color: #667386;
          font-size: 10px;
        }

        @media (max-width: 1150px) {
          .board-review {
            grid-template-columns: 1fr;
          }

          .player-column {
            border-right: 0;
            border-bottom: 1px solid
              rgba(
                255,
                255,
                255,
                0.08
              );
          }

          .occurrence-column {
            min-height: 700px;
          }

          .summary-grid {
            grid-template-columns:
              repeat(3, 1fr);
          }

          .timeline-row {
            grid-template-columns:
              170px minmax(0, 1fr)
              55px;
          }
        }

        @media (max-width: 800px) {
          .app {
            padding: 25px 15px 40px;
          }

          .hero,
          .section-head,
          .run-card,
          .board-header {
            flex-direction: column;
            align-items: stretch;
          }

          .hero h1 {
            font-size: 37px;
          }

          .powered {
            align-self: flex-start;
          }

          .mode-switch {
            flex-direction: column;
          }

          .board-actions {
            flex-direction: column;
          }

          .summary-grid {
            grid-template-columns:
              1fr 1fr;
          }

          .upload-video-row {
            grid-template-columns:
              36px minmax(0, 1fr)
              28px;
          }

          .upload-status {
            grid-column: 2;
          }

          .remove-inline {
            grid-column: 3;
            grid-row: 1 / span 2;
          }

          .timeline-row {
            grid-template-columns: 1fr;
            gap: 5px;
          }

          .timeline-end {
            text-align: left;
          }

          .notes-grid {
            grid-template-columns: 1fr;
          }

          .occurrence-card-top {
            grid-template-columns:
              27px minmax(0, 1fr);
          }

          .occurrence-time {
            grid-column: 2;
            justify-self: start;
            margin-top: 4px;
          }

          .reference-result-grid {
            grid-template-columns: 1fr 1fr;
          }

          .reference-result-section,
          .occurrences,
          .finding-error {
            margin-left: 47px;
          }

          .selected-occurrence-head {
            flex-direction: column;
            align-items: stretch;
          }

          .jump-large {
            width: 100%;
          }

          footer {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}